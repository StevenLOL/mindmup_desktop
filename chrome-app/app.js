/*global jQuery, chrome, MM, FileReader, window, Blob, console, _, observable*/
(function () {
'use strict';
MM.ChromeSyncBackedStorage = function () {
    var self = this;
    self.getItem = function (key) { return this[key]; };
    self.setItem = function (key, val) { this[key] = val; var props = {}; props[key]=val; chrome.storage.sync.set(props); };
    self.removeItem = function (key) { delete this[key]; chrome.storage.sync.remove(key); };
    self.initialise = function () {
        var promise = jQuery.Deferred();
        chrome.storage.sync.get(null, function (items) {
            _.each(items, function (v,k) {
                if (k!== 'mostRecentMapLoaded') {self[k]=v;}
            });
            promise.resolve();
        });
        return promise;
    };
};
MM.ChromeFileAutoSave = function (config, jQueryClassObject, mapController, activeContentListener, chromeFileSystem, alert) {
    var self = this,
        propName = 'chrome-file-autosave',
        currentMapId = false,
        alertId = 0,
        statusRole = 'autosave-in-progress', /* not yet present during init */
				element = jQuery('body'),
				showErrorAlert = function (title, message) {
					alert.hide(alertId);
					alertId = alert.show(title, message, 'error');
				},
        resetSavingPipeline = function () {
            if (chromeFileSystem.recognises(currentMapId)) {
                mapController.publishMap();
            }
        };
    self.activate = function () {
        config.setItem(propName, 'on');
        jQueryClassObject.addClass(propName);
        chromeFileSystem.setAutoSave(true);
        resetSavingPipeline();
        var statusEl = jQuery('[data-chromeapp-role=autosave-notify-on]');
        statusEl.fadeIn({complete:function() { statusEl.fadeOut();}});
        jQuery('[data-chromeapp-role=' + statusRole + ']').hide();
    };
    self.deactivate = function () {
        config.removeItem(propName);
        jQueryClassObject.removeClass(propName);
        chromeFileSystem.setAutoSave(false);
        resetSavingPipeline();
        var statusEl = jQuery('[data-chromeapp-role=autosave-notify-off]');
        statusEl.fadeIn({complete:function() { statusEl.fadeOut();}});
        jQuery('[data-chromeapp-role=' + statusRole + ']').hide();
    };
    mapController.addEventListener('mapLoaded mapSaved', function (mapId) {
        currentMapId = mapId;
        jQuery('[data-chromeapp-role=' + statusRole + ']').hide();
    });
    activeContentListener.addListener(function (content, fileChange) {
        var progStatus = jQuery('[data-chromeapp-role=' + statusRole + ']');
        if (!fileChange && chromeFileSystem.recognises(currentMapId) && chromeFileSystem.isAutoSave()) {
            progStatus.show();
            chromeFileSystem.saveMap(content, currentMapId)
                .done(function () {
                    element.removeClass('map-changed').addClass('map-unchanged');
                })
                .always(function(){
                    progStatus.hide();
                })
                .fail(function(reason){
                    showErrorAlert('Map was not auto-saved', reason);
                    element.removeClass('map-unchanged').addClass('map-changed');
                });
        }
    });
    if (config.getItem(propName) === 'on') {
        self.activate();
    } else {
        self.deactivate();
    }
};
jQuery.fn.chromeWindowMenu = function () {
    var self = this,
        template = self.find('[data-chromeapp-role=template]'),
        templateParent = template.parent(),
        rebuildMenu = function () {
            templateParent.empty();
            _.each(chrome.app.window.getAll(), function (chromeWindow) {
                var item = template.clone().appendTo(templateParent).find('[data-chromeapp-role=activate-link]').text(chromeWindow.title || 'New Map').click(function () {
                    chromeWindow.focus();
                });
                if (chromeWindow.fileId) {
                    item.tooltip({ title: chromeWindow.fileId});
                }
            });
        };
    template.detach();
    self.find('a[data-toggle=dropdown]').click(rebuildMenu);
};
MM.ChromeFileSystem = function () {
    var self = this,
        properties = {editable: true},
        toFilePath = function (mapId) {
            var match = mapId && mapId.match(/^file\/(.*)/);
            return match && match.length>0 && match[1];
        },
        readFileEntry = function(fileEntry) {
            var deferred = jQuery.Deferred();
            fileEntry.file(function(file) {
                var reader = new FileReader();
                reader.onerror = deferred.reject;
                reader.onload = function(e) {
                    deferred.resolve(e.target.result);
                };
                reader.readAsText(file, 'UTF-8');
            });
            return deferred.promise();
        },
        waitForIO = function (writer, callback) {
            // set a watchdog to avoid eventual locking:
            var start = Date.now();
            // wait for a few seconds
            var reentrant = function() {
                if (writer.readyState===writer.WRITING && Date.now()-start<4000) {
                    window.setTimeout(reentrant, 100);
                    return;
                }
                if (writer.readyState===writer.WRITING) {
                    console.error('Write operation taking too long, aborting!'+
                            ' (current writer readyState is '+writer.readyState+')');
                            writer.abort();
                            }
                            else {
                                callback();
                            }
                            };
                            window.setTimeout(reentrant, 100);
                            },
                            writeFileEntry = function (fileEntry, contentToWrite) {
                                var result = jQuery.Deferred();
                                var blob = new Blob([contentToWrite], {type: 'text/plain'});
                                fileEntry.createWriter(function(writer) {
                                    writer.onerror = result.reject;
                                    writer.truncate(blob.size);
                                    waitForIO(writer, function() {
                                        writer.seek(0);
                                        writer.onwriteend = result.resolve;
                                        writer.write(blob);
                                    });
                                });
                                return result;
                            },
                                           findCachedFileEntry = function (mapId) {
                                               var result = jQuery.Deferred();
                                               chrome.storage.local.get(mapId, function(items) {
                                                   if (items[mapId]) {
                                                       chrome.fileSystem.isRestorable(items[mapId], function(bIsRestorable) {
                                                           if (bIsRestorable) {
                                                               chrome.fileSystem.restoreEntry(items[mapId], function(fileEntry) {
                                                                   if (fileEntry && fileEntry.isFile) {
                                                                       result.resolve(fileEntry);
                                                                   } else {
                                                                       result.reject('not-found');
                                                                   }
                                                               });
                                                           } else {
                                                               result.reject('not-found');
                                                           }
                                                       });
                                                   } else {
                                                       result.reject('not-found');
                                                   }
                                               });
                                               return result;
                                           };
                self.toMapId = function(path) {
                    return 'file/'+ path;
                };
                self.loadMap = function (mapId /*, interactive*/) {
                    var result = jQuery.Deferred();
                    findCachedFileEntry(mapId).then(function (fileEntry) {
                        readFileEntry(fileEntry).then(function(content) {
                            result.resolve(/*stringContent, fileId, mimeType, properties, optionalFileName*/content, mapId, undefined, properties, toFilePath(mapId));
                        }, function (/*errorCode */) {
                            result.reject('not-found');
                        });
                    }, result.reject);
                    return result;
                };
                self.cacheEntry = function (theEntry) {
                    var result = jQuery.Deferred();
                    chrome.fileSystem.getDisplayPath(theEntry, function(path) {
                        var props = {},
                        mapId = self.toMapId(path);
                    props[mapId] = chrome.fileSystem.retainEntry(theEntry);
                    chrome.storage.local.set(props, function () {
                        result.resolve(mapId);
                    });
                    });
                    return result;
                };
                self.setAutoSave = function (isAutoSave) {
                    properties.autoSave = isAutoSave;
                };
                self.isAutoSave = function () {
                    return properties.autoSave;
                };
                self.saveMap = function (contentToSave, mapId , fileName /*, interactive */) {
                    var result = jQuery.Deferred(),
                        writeToEntry = function (writableEntry) {
                            var fileContent = typeof(contentToSave) === 'string' ? contentToSave : JSON.stringify(contentToSave, null, 2);
                            if (!writableEntry) {
                                result.reject('user-cancel');
                            }
                            writeFileEntry(writableEntry, fileContent).then(function () {
                                if (!self.recognises(mapId)) {
                                    self.cacheEntry(writableEntry).then(function (newMapId) {
                                        result.resolve(newMapId, properties);
                                    });
                                }
                                else {
                                    result.resolve(mapId, properties);
                                }
                            }, result.reject);
                        };

                    if (toFilePath(mapId) && /.mup$/.test(mapId)) {
                        findCachedFileEntry(mapId).then(writeToEntry, result.reject);
                    } else {
                        chrome.fileSystem.chooseEntry({type: 'saveFile', suggestedName: fileName, accepts: [{ extensions: ['mup'] }]}, writeToEntry);
                    }
                    return result;
                };
                self.recognises = function (mapId) {
                    return mapId === self.prefix || toFilePath(mapId);
                };
                self.prefix = 'f';
                self.description = 'Local File System';
};
var initChromeApp = function () {
    var mapController = MM.Extensions.components.mapController,
        chromeFileSystem = new MM.ChromeFileSystem(),
        loadFileEntry = function (theEntry) {
            if (theEntry && theEntry.isFile) {
                chromeFileSystem.cacheEntry(theEntry).then(function (mapId) {
                    mapController.loadMap(mapId);
                });
            }
        },
        autosave = new MM.ChromeFileAutoSave(MM.Extensions.mmConfig.storage, jQuery('body'), mapController, MM.Extensions.components.activeContentListener, chromeFileSystem, MM.Extensions.components.alert),
        openFileDialog = function () {
            chrome.fileSystem.chooseEntry({type: 'openFile', accepts: [{ extensions: ['mup', 'mm', 'txt'] }]}, loadFileEntry);
        },
        newWindow = function () {
            chrome.app.window.create('index.html', {bounds: {width: 800, height: 500}});
        };
    jQuery('[data-chromeapp-role=open-file]').click(openFileDialog);
    MM.Extensions.components.navigation.off();
    mapController.addMapSource(new MM.FileSystemMapSource(chromeFileSystem));
    mapController.validMapSourcePrefixesForSaving = chromeFileSystem.prefix;
    jQuery('[data-chromeapp-role=reload-map]').click(function () {
        var currentId = mapController.currentMapId();
        if (currentId) {
            mapController.loadMap(currentId, true);
        }
    });
    jQuery('[data-chromeapp-role=new-window]').click(newWindow);
    jQuery('[data-chromeapp-role=window-menu]').chromeWindowMenu();
    MM.Extensions.components.activeContentListener.addListener(function(idea) {
        chrome.app.window.current().title=idea.title;
    });
    mapController.addEventListener('mapLoaded mapSaved', function (mapId) {
        var filePath = chromeFileSystem.recognises(mapId);
        jQuery('[data-chromeapp-role=save-loc]').tooltip('destroy');
        chrome.app.window.current().fileId = undefined;
        if (filePath) {
            if (filePath.length > 30) {
                filePath = filePath.substring(12) + '...' + filePath.substring(filePath.length - 12);
            }
            chrome.app.window.current().fileId = filePath;
            jQuery('[data-chromeapp-role=save-loc]').tooltip({title: filePath});
        }
    });
    jQuery('#mainMenu [data-mm-role=save]').remove();
    jQuery('[data-chromeapp-role=save]').click(function () {
        mapController.publishMap('f');
    });
    jQuery('[data-chromeapp-role=save-new-file]').click(function () {
        mapController.publishMap('f', true);
    });
    jQuery('[data-chromeapp-role=autosave-activate]').click(function () {
        autosave.activate();
    });
    jQuery('[data-chromeapp-role=autosave-deactivate]').click(function () {
        autosave.deactivate();
    });
},
    extendUI = function () {
        jQuery('#mainMenu [data-mm-role=new-map]').attr('data-mm-map-source', 'f');
        jQuery('#chrome-app-templates [data-chromeapp-role=file-menu]').detach().children()
            .insertAfter(jQuery('#mainMenu [data-mm-role=open-sources]').parent());
        jQuery('#modalKeyActions [data-slide-to=1]').attr('data-mm-role', 'dismiss-modal new-map').attr('data-mm-map-source', 'f').attr('data-target','');
        jQuery('#modalKeyActions [data-slide-to=2]').attr('data-mm-role', 'dismiss-modal').attr('data-target','').attr('data-chromeapp-role','open-file');
        jQuery('#modalKeyActions h3 small').text('Zero-friction mind mapping');
        jQuery('[data-mm-role=bookmark-pin]').parent().remove();
        jQuery('[data-mm-role=bookmark]').remove();
        jQuery('#listBookmarks').attr('id','');
        jQuery('#modalGoldLicense [data-mm-role=kickoff-sign-up]').attr({'data-mm-target-section': 'go-online', 'data-mm-role':'show-section'});
        jQuery('#modalGoldLicense [data-mm-role~=form-submit]').attr({'data-mm-target-section': 'go-online', 'data-mm-role':'show-section'});
        jQuery('#chrome-app-templates [data-chromeapp-role=gold-go-online]').detach().appendTo('#modalGoldLicense .modal-body');
        jQuery('#chrome-app-templates [data-chromeapp-role=gold-buttons]').detach().children().appendTo('#modalGoldLicense .modal-footer');
        jQuery('#chrome-app-templates [data-chromeapp-role=window-menu]').detach().appendTo('#mainMenu');
        jQuery('#chrome-app-templates [data-chromeapp-role=autosave-status]').detach().prependTo('#topbar .navbar-inner .nav.pull-right').children().css('display','none');

    },
    extendConfig = function () {
        var oldMMMain = MM.main,
        syncStore = new MM.ChromeSyncBackedStorage();
        MM.AutoSave = function () {
            return observable(this);
        };
        MM.main = function (config) {
            config.storage = syncStore;
            config.urlShortener = observable({});
						config.newMapProperties = {editable: true, reloadOnSave: true};
            oldMMMain(config);
        };
        return syncStore.initialise();
    },
    initMM = window.onload;
window.onload = function () {
    extendUI();
    extendConfig().then(function () {
        initMM();
        initChromeApp();
    });
};
})();
