/*global $, MM, jQuery, JSON, _, gapi, MAPJS, window, observable */
MM.RealtimeGoogleMapSource = function (googleDriveAdapter) {
	'use strict';
	var nextSessionName,
		properties = {autoSave: true, editable: true, reloadOnSave: true},
		self = observable(this),
		makeRealtimeReady = function (showAuth) {
			var deferred = jQuery.Deferred(),
				loadRealtimeApis = function () {
					if (gapi.drive && gapi.drive.realtime) {
						deferred.resolve();
					} else {
						gapi.load('auth:client,picker,drive-realtime,drive-share', deferred.resolve);
					}
				};
			googleDriveAdapter.ready(showAuth).then(loadRealtimeApis, deferred.reject, deferred.notify);
			return deferred.promise();
		},
		createRealtimeMap = function (name, initialContent, showAuth) {
			var deferred = jQuery.Deferred(),
				fileCreated = function (mindMupId) {
					gapi.drive.realtime.load(googleDriveAdapter.toGoogleFileId(mindMupId),
						function onFileLoaded(doc) {
							doc.close();
							deferred.resolve('c' + mindMupId, properties);
						},
						function initializeModel(model) {
							var list = model.createList();
							model.getRoot().set('events', list);
							model.getRoot().set('focusNodes', model.createMap());
							model.getRoot().set('initialContent', JSON.stringify(initialContent));
						}
						);
				};
			makeRealtimeReady(showAuth).then(
				function () {
					googleDriveAdapter.saveFile('MindMup collaborative session ' + name, undefined, name, 'application/vnd.mindmup.collab').then(
						fileCreated,
						deferred.reject,
						deferred.notify
					);
				},
				deferred.reject,
				deferred.notify
			);
			return deferred.promise();
		};
	this.setNextSessionName = function (name) {
		nextSessionName = name;
	};
	this.loadMap = function loadMap(mindMupId, showAuth) {
		var deferred = jQuery.Deferred(),
			realtimeError = function () {
				deferred.reject('network-error');
				$(window).off('error', realtimeError);
				deferred = undefined;
			},
			initMap = function initMap() {
				try {
					$(window).on('error', realtimeError);
					deferred.notify('Connecting to Google Drive Realtime');
					gapi.drive.realtime.load(
						mindMupId.substr(3),
						function onFileLoaded(doc) {
							deferred.notify('Getting realtime document contents');
							var modelRoot = doc.getModel().getRoot(),
								contentText = modelRoot.get('initialContent'),
								events = modelRoot.get('events'),
								contentAggregate,
								googleSessionId,
								localSessionId,
								applyEvents = function (mindmupEvents, sessionId) {
									mindmupEvents.forEach(function (event) {
										contentAggregate.execCommand(event.cmd, event.args, sessionId);
									});
								},
								onEventAdded = function (event) {
									if (!event.isLocal) {
										applyEvents(event.values, 'gd' + event.sessionId);
									}
								},
								onMyJoining = function (collaboratorMe) {
									googleSessionId = collaboratorMe.sessionId;
									localSessionId = 'gd' + googleSessionId;
									deferred.notify('Initializing map from realtime document');
									self.dispatchEvent('realtimeDocumentLoaded', doc, mindMupId);
									if (!contentText) {
										$(window).off('error', realtimeError);
										deferred.reject('realtime-error', 'Error loading ' + mindMupId + ' content');
										deferred = undefined;
										return;
									}
									contentAggregate = MAPJS.content(JSON.parse(contentText), localSessionId);
									applyEvents(events.asArray(), localSessionId);
									contentAggregate.addEventListener('changed', function (command, params, session) {
										if (session === localSessionId) {
											events.push({cmd: command, args: params});
										}
									});
									contentAggregate.addEventListener('resourceStored', function (resourceBody, resourceId, session) {
										if (session === localSessionId) {
											events.push({cmd: 'storeResource', args: [resourceBody, resourceId]});
										}
									});
									events.addEventListener(gapi.drive.realtime.EventType.VALUES_ADDED, onEventAdded);
									deferred.resolve(contentAggregate, mindMupId, properties);
									$(window).off('error', realtimeError);
									deferred = undefined;
								},
								me = _.find(doc.getCollaborators(), function (x) {
									return x.isMe;
								});
							if (me) {
								onMyJoining(me);
							} else {
								deferred.notify('Waiting for session to start');
								doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, function (event) {
									if (event.collaborator.isMe) {
										onMyJoining(event.collaborator);
									}
								});
							}
						},
						function initializeModel() {
							deferred.reject('realtime-error', 'Session ' + mindMupId + ' has not been initialised');
						},
						function errorHandler(error) {
							if (deferred) {
								if (error && error.type === 'forbidden') {
									deferred.reject('no-access-allowed');
								} else {
									deferred.reject('realtime-error', error.message || error);
								}
							} else {
								if (error.type === gapi.drive.realtime.ErrorType.TOKEN_REFRESH_REQUIRED) {
									googleDriveAdapter.ready(false).fail(function () {
										self.dispatchEvent('realtimeError', 'Session expired', true);
									});
								} else {
									self.dispatchEvent('realtimeError', error.message || error, error.isFatal);
								}
							}
						}
					);
				} catch (e) {
					deferred.reject(e);
				}
			};
		makeRealtimeReady(showAuth).then(
			initMap,
			deferred.reject,
			deferred.notify
		);
		return deferred.promise();
	};
	this.saveMap = function (map, mapId, showAuth) {
		if (this.recognises(mapId) && mapId.length > 2) {
			return jQuery.Deferred().resolve(mapId, map, properties).promise(); /* no saving needed, realtime updates */
		}
		return createRealtimeMap(nextSessionName, map, showAuth);
	};
	this.description = 'Google Drive Realtime';
	this.recognises = function (mapId) {
		return (/^cg/).test(mapId);
	};
};
MM.RealtimeGoogleDocumentMediator = function (doc, collaborationModel, mindmupMapId, mapController, unloadNotifier) {
	'use strict';
	var focusNodes,
			events,
			me,
			self = this,
			getGoogleCollaboratorByUserId = function (userIdKey) {
				if (userIdKey === me.userId) {
					return false;
				}
				return _.find(doc.getCollaborators(), function (x) {
					return String(x.userId) === String(userIdKey);
				}) || {};
			},
			getGoogleCollaboratorBySession = function (sessionKey) {
				return _.find(doc.getCollaborators(), function (x) {
					return String(x.sessionId) === String(sessionKey);
				}) || {};
			},
			mmCollaborator = function (googleCollaborator) {
				if (googleCollaborator.userId === me.userId) {
					return false;
				}
				return {
					photoUrl: googleCollaborator.photoUrl,
					focusNodeId: focusNodes.get(googleCollaborator.sessionId),
					sessionId: googleCollaborator.userId,
					name: googleCollaborator.displayName,
					color: googleCollaborator.color || '#000'
				};
			},
			onMyFocusChanged = function (nodeId) {
				focusNodes.set(me.sessionId, nodeId);
			},
			onCollaboratorJoined = function (event) {
				if (event.collaborator.userId !== me.userId) {
					collaborationModel.collaboratorPresenceChanged(mmCollaborator(event.collaborator), true);
				}
			},
			onCollaboratorLeft = function (event) {
				if (event.collaborator.userId !== me.userId) {
					collaborationModel.collaboratorPresenceChanged(mmCollaborator(event.collaborator), false);
				}
			},
			getCollaborators = function () {
				var unique = {};
				_.each(doc.getCollaborators(), function (other) {
					if (other.userId !== me.userId && !unique[other.userId]) {
						unique[other.userId] = other;
					}
				});
				return _.map(_.values(unique), mmCollaborator);
			},
			triggerFocusForEvent = function (event) {
				if (event.userId === me.userId) {
					return;
				}
				var googleCollaborator = getGoogleCollaboratorBySession(event.sessionId);
				collaborationModel.collaboratorFocusChanged(mmCollaborator(googleCollaborator));
			},
			onCollaboratorRequestedForContentSession = function (contentSessionId, callBack) {
				if (!callBack) {
					return;
				}
				var googleSessionId = contentSessionId.substr(2),
					googleCollaborator = googleSessionId && getGoogleCollaboratorBySession(googleSessionId),
					collaborator = googleCollaborator && mmCollaborator(googleCollaborator);
				if (collaborator && collaborator.sessionId) {
					callBack(collaborator);
				}
			},
			handleFocusRequest = function (userId, focusProcessor) {
				var googleCollaborator = getGoogleCollaboratorByUserId(userId),
					focusNode = googleCollaborator && focusNodes.get(googleCollaborator.sessionId);
				if (focusProcessor && focusNode) {
					focusProcessor(focusNode);
				}
			},
			closeDocOnUnload = function () {
				doc.close();
			},
			start = function () {
				events.addEventListener(gapi.drive.realtime.EventType.VALUES_ADDED, triggerFocusForEvent);
				focusNodes.addEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, triggerFocusForEvent);
				doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_LEFT, onCollaboratorLeft);
				doc.addEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, onCollaboratorJoined);
				collaborationModel.addEventListener('myFocusChanged', onMyFocusChanged);
				collaborationModel.addEventListener('collaboratorRequestedForContentSession', onCollaboratorRequestedForContentSession);
				collaborationModel.addEventListener('sessionFocusRequested', handleFocusRequest);
				mapController.addEventListener('mapLoaded mapSaved', trackMapId);
				unloadNotifier.bind('beforeunload', closeDocOnUnload);
				collaborationModel.start(getCollaborators());
			},
			trackMapId = function (mapId) {
				if (mindmupMapId !== mapId) {
					self.stop();
				}
			};
	self.stop = function () {
		collaborationModel.stop();
		events.removeEventListener(gapi.drive.realtime.EventType.VALUES_ADDED, triggerFocusForEvent);
		focusNodes.removeEventListener(gapi.drive.realtime.EventType.VALUE_CHANGED, triggerFocusForEvent);
		doc.removeEventListener(gapi.drive.realtime.EventType.COLLABORATOR_LEFT, onCollaboratorLeft);
		doc.removeEventListener(gapi.drive.realtime.EventType.COLLABORATOR_JOINED, onCollaboratorJoined);
		collaborationModel.removeEventListener('sessionFocusRequested', handleFocusRequest);
		collaborationModel.removeEventListener('collaboratorRequestedForContentSession', onCollaboratorRequestedForContentSession);
		collaborationModel.removeEventListener('myFocusChanged', onMyFocusChanged);
		mapController.removeEventListener('mapSaved mapLoaded', trackMapId);
		unloadNotifier.unbind('beforeunload', closeDocOnUnload);
		doc.close();
	};

	unloadNotifier = unloadNotifier || jQuery(window);
	focusNodes = doc.getModel().getRoot().get('focusNodes');
	events = doc.getModel().getRoot().get('events');
	me = _.find(doc.getCollaborators(), function (googleCollaborator) {
		return googleCollaborator.isMe;
	});
	start();
};

MM.Extensions.googleCollaboration = function () {
	'use strict';
	var googleDriveAdapter =  MM.Extensions.components.googleDriveAdapter,
		alert = MM.Extensions.components.alert,
		realtimeMapSource = new MM.RealtimeGoogleMapSource(googleDriveAdapter),
		collaborationModel = MM.Extensions.components.collaborationModel,
		mapController = MM.Extensions.components.mapController,
		startSession = function (name) {
			realtimeMapSource.setNextSessionName(name);
			mapController.publishMap('cg');
		},
		documentMediator,
		loadUI = function (html) {
			var parsed = $(html),
				menu = parsed.find('[data-mm-role=top-menu]').clone().appendTo($('#mainMenu')),
				modal = parsed.find('[data-mm-role=modal-start]').clone().appendTo($('body')),
				sessionNameField = modal.find('input[name=session-name]'),
				saveButton = jQuery('[data-mm-role=publish]'),
				setOnline = function (online) {
					var flag = online ? 'online' : 'offline',
						items = menu.find('[data-mm-collab-visible]');
					items.hide();
					items.filter('[data-mm-collab-visible=' + flag + ']').show();
				},
				initializeSessionFromUi = function () {
					var sessionName = sessionNameField.val();
					if (!sessionName) {
						sessionNameField.parent().addClass('error');
						return false;
					}
					modal.modal('hide');
					startSession(sessionName);
					return false;
				};
			$('#mainMenu').find('[data-mm-role=optional]').hide();
			menu.find('[data-mm-role=start]').click(function () {
				sessionNameField.val('');
				sessionNameField.parent().removeClass('error');
				modal.modal('show');
			});
			menu.find('[data-mm-role=c-toggle-class]').toggleClassWidget();
			menu.find('[data-mm-role~=c-google-drive-open]').googleDriveOpenWidget(googleDriveAdapter, mapController,  MM.Extensions.components.modalConfirm,  MM.Extensions.components.activityLog);
			modal.on('shown', function () {
				sessionNameField.focus();
			});
			menu.find('[data-mm-role=invite]').click(function () {
				var mapId = mapController.currentMapId();
				if (realtimeMapSource.recognises(mapId)) {
					googleDriveAdapter.showSharingSettings(mapId.substr(1));
				}
			});
			$('[data-mm-role=sharelinks]').append(menu.find('[data-mm-role=invite]').parent('li').clone(true).addClass('visible-map-source-c'));
			menu.find('[data-mm-role=leave]').click(function () {
				mapController.loadMap('new-g');
			});
			modal.find('[data-mm-role=start-session]').click(initializeSessionFromUi);
			modal.find('form').submit(initializeSessionFromUi);
			mapController.addEventListener('mapLoaded mapSaved', function (mapId) {
				setOnline(realtimeMapSource.recognises(mapId));
			});
			realtimeMapSource.addEventListener('realtimeDocumentLoaded', function (doc) {
				doc.addEventListener(gapi.drive.realtime.EventType.DOCUMENT_SAVE_STATE_CHANGED, function (docState) {
					if (docState.isPending || docState.isSaving) {
						if (!$('i[class="icon-spinner icon-spin"]', saveButton).length) {
							saveButton.prepend('<i class="icon-spinner icon-spin"></i>');
						}
					} else {
						$('i[class="icon-spinner icon-spin"]', saveButton).remove();
					}
				});
			});
		};
	mapController.addMapSource(new MM.RetriableMapSourceDecorator(realtimeMapSource));
	realtimeMapSource.addEventListener('realtimeDocumentLoaded', function (doc, mindMupId) {
		documentMediator = new MM.RealtimeGoogleDocumentMediator(doc, collaborationModel, mindMupId, mapController);
		documentMediator.mapId = mindMupId;
	});

	realtimeMapSource.addEventListener('realtimeError', function (errorMessage, isFatal) {
		if (isFatal) {
			alert.show('Network error: ' + errorMessage + '!', 'Please refresh the page before changing the map any further, your updates might not be saved', 'error');
		} else {
			alert.show('Network error: ' + errorMessage + '!', 'If the error persists, please refresh the page', 'flash');
		}
	});
	$.get(MM.Extensions.mmConfig.publicUrl + '/e/google-collaboration.html', loadUI);
	$('<link rel="stylesheet" href="' + MM.Extensions.mmConfig.publicUrl + '/e/google-collaboration.css" />').appendTo($('body'));
};

if (!window.jasmine) {
	MM.Extensions.googleCollaboration();
}
