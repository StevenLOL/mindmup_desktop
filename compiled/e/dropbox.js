/*global MM, window, jQuery, $, Dropbox, _ */
/*jshint camelcase: false*/
$.fn.dropboxOpenWidget = function (mapController, dropboxFileSystem) {
	'use strict';
	var modal = this,
		template = modal.find('[data-mm-role=template]'),
		parent = template.parent(),
		statusDiv = modal.find('[data-mm-role=status]'),
		showAlert = function (message, type) {
			type = type || 'block';
			statusDiv.html('<div class="alert fade-in alert-' + type + '">' +
					'<button type="button" class="close" data-dismiss="alert">&#215;</button>' +
					'<strong>' + message + '</strong>' + '</div>');
		},
		error = function (errorStatus) {
			showAlert(errorStatus, 'error');
		},
		fileRetrieval = function (interactive, path, parentPath) {
			var loaded = function (fileList) {
					var added,
						sorted = _.sortBy(fileList, function (file) {
							return file && !file.mapId && file.modifiedAt;
						}).reverse();
					statusDiv.empty();
					if (parentPath) {
						added = template.filter('[data-mm-type=dir]').clone().appendTo(parent);
						added.find('a[data-mm-role=dir-link]')
							.text('..')
							.click(function () {
								fileRetrieval(false, parentPath);
							});
					}
					_.each(sorted, function (file) {

						if (file.mapId) {
							added = template.filter('[data-mm-type=file]').clone().appendTo(parent);
							added.find('a[data-mm-role=file-link]')
								.text(file.name)
								.click(function () {
									modal.modal('hide');
									mapController.loadMap(file.mapId);
								});
							added.find('[data-mm-role=modification-status]').text(new Date(file.modifiedAt).toLocaleString());
						} else {
							added = template.filter('[data-mm-type=dir]').clone().appendTo(parent);
							added.find('a[data-mm-role=dir-link]')
								.text(file.name)
								.click(function () {
									fileRetrieval(false, file.path, path);
								});
						}
					});
				},
				loadNotify = function (message) {
					statusDiv.html('<i class="icon-spinner icon-spin"/> ' + message);
				},
				loadError = function (reason) {
					if (reason === 'failed-authentication') {
						error('Authentication failed, we were not able to access your Dropbox');
					} else if (reason === 'not-authenticated') {
						showAlert('<h4>Authorisation required</h4>' +
							'<p>This action requires authorisation to access your Dropbox. <br/><a href="#">Click here to authorise</a></p>');
						statusDiv.find('a').click(function () {
							fileRetrieval(true, path);
						});
					} else {
						error('There was a network error, please try again later');
					}
				};
			parent.empty();
			dropboxFileSystem.listFiles(interactive, path).then(loaded, loadError, loadNotify);
		};
	modal.on('show', function () {
		fileRetrieval(false, '/');
	});
	return modal;
};
MM.Extensions.Dropbox = {
	popupLogin: function () {
		'use strict';
		var deferred = jQuery.Deferred(),
			popupFrame = window.open('/dropbox', '_blank', 'height=700,width=1200,location=no,menubar=no,resizable=yes,status=no,toolbar=no'),
			onMessage = function (message) {
				if (message && message.dropbox_credentials) {
					deferred.resolve(message.dropbox_credentials);
				} else if (message && message.dropbox_error) {
					deferred.reject('failed-authentication', message.dropbox_error);
				}
			},
			checkClosed = function () {
				if (popupFrame.closed) {
					deferred.reject('user-cancel');
				}
			},
			interval = window.setInterval(checkClosed, 200);
		deferred.always(function () {
			window.MMDropboxCallBack = undefined;
			window.clearInterval(interval);
		});
		/* don't do window.addListener here as it's not deterministic if that or window.close will get to us first */
		window.MMDropboxCallBack = onMessage;
		return deferred.promise();
	},
	DropboxFileSystem: function (appKey) {
		'use strict';
		var self = this,
			properties = {},
			client,
			makeReady = function (interactive) {
				var result = jQuery.Deferred();

				if (!client) {
					if (window.Dropbox && window.Dropbox.Client) {
						result.notify('Initializing Dropbox');
						client = new Dropbox.Client({key: appKey});
					} else {
						result.reject('Dropbox API not loaded');
						return result.promise();
					}
				}
				if (client.isAuthenticated()) {
					result.resolve();
				} else {
					result.notify('Authenticating with Dropbox');
					if (!interactive) {
						client.reset();
						client.authenticate({interactive: false}, function (dropboxError) {
							if (dropboxError || !client.isAuthenticated()) {
								result.reject('not-authenticated');
							} else {
								result.resolve();
							}
						});
					} else {
						MM.Extensions.Dropbox.popupLogin().then(
							function (credentials) {
								client.setCredentials(credentials);
								result.resolve();
							},
							result.reject,
							result.notify
						);
					}
				}
				return result.promise();
			},
			toDropboxPath = function (mapId) {
				if ((/^d1/).test(mapId)) {
					return decodeURIComponent(mapId.slice(2));
				}
				return false;
			},
			toMapId = function (dropboxFileStat) {
				if ((dropboxFileStat.isFile || !dropboxFileStat.is_dir) && dropboxFileStat.path) {
					return 'd1' + encodeURIComponent(dropboxFileStat.path);
				}
				return false;
			},
			toMindMupError = function (dropboxApiError) {
				var errorMap = {
					401: 'not-authenticated',
					403: 'not-authenticated',
					404: 'not-found',
					507: 'file-too-large'
				};
				if (dropboxApiError.status && errorMap[dropboxApiError.status]) {
					return errorMap[dropboxApiError.status];
				}
				return 'network-error';
			},
			fileMapper = function (fileStat) {
				var result = _.pick(fileStat, 'modifiedAt', 'name', 'path');
				result.mapId = toMapId(fileStat);
				return result;
			};
		self.listFiles = function (interactive, path) {
			var result = jQuery.Deferred(),
				listCallback = function (dropboxApiError, entryNames, folderStat, folderContentStats) {
					if (dropboxApiError) {
						result.reject(toMindMupError(dropboxApiError));
					} else if (folderContentStats) {
						result.resolve(_.map(folderContentStats, fileMapper));
					} else {
						result.reject('network-error');
					}
				},
				list = function () {
					result.notify('Loading files from DropBox');
					client.readdir(path, {}, listCallback);
				};
			makeReady(interactive).then(list, result.reject, result.notify);
			return result.promise();
		};
		self.loadMap = function (mapId, interactive) {
			var result = jQuery.Deferred(),
				loadCallback = function (dropboxApiError, dropboxFileContent, dropboxFileStat) {
					if (typeof (dropboxFileStat) === 'string') {
						dropboxFileStat = JSON.parse(dropboxFileStat);
					}
					if (dropboxApiError) {
						var mmError = toMindMupError(dropboxApiError);
						if (dropboxApiError.response && dropboxApiError.response.error) {
							result.reject(mmError, dropboxApiError.response.error);
						} else {
							result.reject(mmError);
						}
					} else if (dropboxFileContent && dropboxFileStat && dropboxFileStat.name) {
						result.resolve(dropboxFileContent, mapId, undefined, properties, dropboxFileStat.name);
					} else {
						result.reject('network-error');
					}
				},
				loadFromDropbox = function () {
					client.readFile(toDropboxPath(mapId), {}, loadCallback);
				};
			makeReady(interactive).then(loadFromDropbox, result.reject, result.notify);
			return result.promise();
		};
		self.saveMap = function (contentToSave, mapId, fileName, interactive) {
			var result = jQuery.Deferred(),
				sendCallback = function (dropboxApiError, dropboxFileStat) {
					if (typeof (dropboxFileStat) === 'string') {
						dropboxFileStat = JSON.parse(dropboxFileStat);
					}
					if (dropboxApiError) {
						result.reject(toMindMupError(dropboxApiError));
					} else if (dropboxFileStat && toMapId(dropboxFileStat)) {
						result.resolve(toMapId(dropboxFileStat), properties);
					} else {
						result.reject('network-error');
					}
				},
				sendToDropbox = function () {
					client.writeFile(toDropboxPath(mapId) || fileName, contentToSave, {}, sendCallback);
				};
			makeReady(interactive).then(sendToDropbox, result.reject, result.notify);
			return result.promise();
		};
		self.recognises = function (mapId) {
			return mapId === self.prefix || toDropboxPath(mapId);
		};
		self.prefix = 'd';
		self.description = 'Dropbox';
	},
	load: function () {
		'use strict';
		var mapController = MM.Extensions.components.mapController,
			fileSystem = new MM.Extensions.Dropbox.DropboxFileSystem(MM.Extensions.mmConfig.dropboxAppKey),
			loadUI = function (html) {
				var dom = $(html);
				$('[data-mm-role=save] ul').append(dom.find('[data-mm-role=save-link]').clone());
				$('ul[data-mm-role=save]').append(dom.find('[data-mm-role=save-link]').clone());
				$('[data-mm-role=open-sources]').prepend(dom.find('[data-mm-role=open-link]'));
				$('[data-mm-role=new-sources]').prepend(dom.find('[data-mm-role=new-link]'));
				dom.find('#modalDropboxOpen').detach().appendTo('body').dropboxOpenWidget(mapController, fileSystem);
				mapController.validMapSourcePrefixesForSaving += fileSystem.prefix;
			};
		mapController.addMapSource(new MM.RetriableMapSourceDecorator(new MM.FileSystemMapSource(fileSystem)));
		$.get(MM.Extensions.mmConfig.publicUrl + '/e/dropbox.html', loadUI);
		$('<link rel="stylesheet" href="' + MM.Extensions.mmConfig.publicUrl + '/e/dropbox.css" />').appendTo($('body'));
	}
};
if (!window.jasmine) {
	MM.Extensions.Dropbox.load();
}
