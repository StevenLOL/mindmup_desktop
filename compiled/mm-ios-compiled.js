var MAPJS = MAPJS || {};
/*global console*/
/*jshint unused:false */
var observable = function (base) {
	'use strict';
	var listeners = [], x;
	base.addEventListener = function (types, listener, priority) {
		types.split(' ').forEach(function (type) {
			if (type) {
				listeners.push({
					type: type,
					listener: listener,
					priority: priority || 0
				});
			}
		});
	};
	base.listeners = function (type) {
		return listeners.filter(function (listenerDetails) {
			return listenerDetails.type === type;
		}).map(function (listenerDetails) {
			return listenerDetails.listener;
		});
	};
	base.removeEventListener = function (type, listener) {
		listeners = listeners.filter(function (details) {
			return details.listener !== listener;
		});
	};
	base.dispatchEvent = function (type) {
		var args = Array.prototype.slice.call(arguments, 1);
		listeners
			.filter(function (listenerDetails) {
				return listenerDetails.type === type;
			})
			.sort(function (firstListenerDetails, secondListenerDetails) {
				return secondListenerDetails.priority - firstListenerDetails.priority;
			})
			.some(function (listenerDetails) {
				try {
					return listenerDetails.listener.apply(undefined, args) === false;
				} catch (e) {
					console.log('dispatchEvent failed', e, listenerDetails);
				}

			});
	};
	return base;
};
/*global MAPJS */
MAPJS.URLHelper = {
	urlPattern: /(https?:\/\/|www\.)[\w-]+(\.[\w-]+)+([\w.,!@?^=%&amp;:\/~+#-]*[\w!@?^=%&amp;\/~+#-])?/i,
	containsLink : function (text) {
		'use strict';
		return MAPJS.URLHelper.urlPattern.test(text);
	},
	getLink : function (text) {
		'use strict';
		var url = text.match(MAPJS.URLHelper.urlPattern);
		if (url && url[0]) {
			url = url[0];
			if (!/https?:\/\//i.test(url)) {
				url = 'http://' + url;
			}
		}
		return url;
	},
	stripLink : function (text) {
		'use strict';
		return text.replace(MAPJS.URLHelper.urlPattern, '');
	}
};
/*jslint eqeq: true, forin: true, nomen: true*/
/*jshint unused:false, loopfunc:true */
/*global _, MAPJS, observable*/
MAPJS.content = function (contentAggregate, sessionKey) {
	'use strict';
	var cachedId,
		invalidateIdCache = function () {
			cachedId = undefined;
		},
		maxId = function maxId(idea) {
			idea = idea || contentAggregate;
			if (!idea.ideas) {
				return parseInt(idea.id, 10) || 0;
			}
			return _.reduce(
				idea.ideas,
				function (result, subidea) {
					return Math.max(result, maxId(subidea));
				},
				parseInt(idea.id, 10) || 0
			);
		},
		nextId = function nextId(originSession) {
			originSession = originSession || sessionKey;
			if (!cachedId) {
				cachedId =  maxId();
			}
			cachedId += 1;
			if (originSession) {
				return cachedId + '.' + originSession;
			}
			return cachedId;
		},
		init = function (contentIdea, originSession) {
			if (!contentIdea.id) {
				contentIdea.id = nextId(originSession);
			} else {
				invalidateIdCache();
			}
			if (contentIdea.ideas) {
				_.each(contentIdea.ideas, function (value, key) {
					contentIdea.ideas[parseFloat(key)] = init(value, originSession);
				});
			}
			if (!contentIdea.title) {
				contentIdea.title = '';
			}
			contentIdea.containsDirectChild = contentIdea.findChildRankById = function (childIdeaId) {
				return parseFloat(
					_.reduce(
						contentIdea.ideas,
						function (res, value, key) {
							return value.id == childIdeaId ? key : res;
						},
						undefined
					)
				);
			};
			contentIdea.findSubIdeaById = function (childIdeaId) {
				var myChild = _.find(contentIdea.ideas, function (idea) {
					return idea.id == childIdeaId;
				});
				return myChild || _.reduce(contentIdea.ideas, function (result, idea) {
					return result || idea.findSubIdeaById(childIdeaId);
				}, undefined);
			};
			contentIdea.find = function (predicate) {
				var current = predicate(contentIdea) ? [_.pick(contentIdea, 'id', 'title')] : [];
				if (_.size(contentIdea.ideas) === 0) {
					return current;
				}
				return _.reduce(contentIdea.ideas, function (result, idea) {
					return _.union(result, idea.find(predicate));
				}, current);
			};
			contentIdea.getAttr = function (name) {
				if (contentIdea.attr && contentIdea.attr[name]) {
					return _.clone(contentIdea.attr[name]);
				}
				return false;
			};
			contentIdea.sortedSubIdeas = function () {
				if (!contentIdea.ideas) {
					return [];
				}
				var result = [],
					childKeys = _.groupBy(_.map(_.keys(contentIdea.ideas), parseFloat), function (key) {
						return key > 0;
					}),
					sortedChildKeys = _.sortBy(childKeys[true], Math.abs).concat(_.sortBy(childKeys[false], Math.abs));
				_.each(sortedChildKeys, function (key) {
					result.push(contentIdea.ideas[key]);
				});
				return result;
			};
			contentIdea.traverse = function (iterator, postOrder) {
				if (!postOrder) {
					iterator(contentIdea);
				}
				_.each(contentIdea.sortedSubIdeas(), function (subIdea) {
					subIdea.traverse(iterator, postOrder);
				});
				if (postOrder) {
					iterator(contentIdea);
				}
			};
			return contentIdea;
		},
		maxKey = function (kvMap, sign) {
			sign = sign || 1;
			if (_.size(kvMap) === 0) {
				return 0;
			}
			var currentKeys = _.keys(kvMap);
			currentKeys.push(0); /* ensure at least 0 is there for negative ranks */
			return _.max(_.map(currentKeys, parseFloat), function (x) {
				return x * sign;
			});
		},
		nextChildRank = function (parentIdea) {
			var newRank, counts, childRankSign = 1;
			if (parentIdea.id == contentAggregate.id) {
				counts = _.countBy(parentIdea.ideas, function (v, k) {
					return k < 0;
				});
				if ((counts['true'] || 0) < counts['false']) {
					childRankSign = -1;
				}
			}
			newRank = maxKey(parentIdea.ideas, childRankSign) + childRankSign;
			return newRank;
		},
		appendSubIdea = function (parentIdea, subIdea) {
			var rank;
			parentIdea.ideas = parentIdea.ideas || {};
			rank = nextChildRank(parentIdea);
			parentIdea.ideas[rank] = subIdea;
			return rank;
		},
		findIdeaById = function (ideaId) {
			return contentAggregate.id == ideaId ? contentAggregate : contentAggregate.findSubIdeaById(ideaId);
		},
		sameSideSiblingRanks = function (parentIdea, ideaRank) {
			return _(_.map(_.keys(parentIdea.ideas), parseFloat)).reject(function (k) {
				return k * ideaRank < 0;
			});
		},
		sign = function (number) {
			/* intentionally not returning 0 case, to help with split sorting into 2 groups */
			return number < 0 ? -1 : 1;
		},
		eventStacks = {},
		redoStacks = {},
		isRedoInProgress = false,
		batches = {},
		notifyChange = function (method, args, originSession) {
			if (originSession) {
				contentAggregate.dispatchEvent('changed', method, args, originSession);
			} else {
				contentAggregate.dispatchEvent('changed', method, args);
			}
		},
		appendChange = function (method, args, undofunc, originSession) {
			var prev;
			if (method === 'batch' || batches[originSession] || !eventStacks || !eventStacks[originSession] || eventStacks[originSession].length === 0) {
				logChange(method, args, undofunc, originSession);
				return;
			} else {
				prev = eventStacks[originSession].pop();
				if (prev.eventMethod === 'batch') {
					eventStacks[originSession].push({
						eventMethod: 'batch',
						eventArgs: prev.eventArgs.concat([[method].concat(args)]),
						undoFunction: function () {
							undofunc();
							prev.undoFunction();
						}
					});
				} else {
					eventStacks[originSession].push({
						eventMethod: 'batch',
						eventArgs: [[prev.eventMethod].concat(prev.eventArgs)].concat([[method].concat(args)]),
						undoFunction: function () {
							undofunc();
							prev.undoFunction();
						}
					});
				}
			}
			if (isRedoInProgress) {
				contentAggregate.dispatchEvent('changed', 'redo', undefined, originSession);
			} else {
				notifyChange(method, args, originSession);
				redoStacks[originSession] = [];
			}
		},
		logChange = function (method, args, undofunc, originSession) {
			var event = {eventMethod: method, eventArgs: args, undoFunction: undofunc};
			if (batches[originSession]) {
				batches[originSession].push(event);
				return;
			}
			if (!eventStacks[originSession]) {
				eventStacks[originSession] = [];
			}
			eventStacks[originSession].push(event);

			if (isRedoInProgress) {
				contentAggregate.dispatchEvent('changed', 'redo', undefined, originSession);
			} else {
				notifyChange(method, args, originSession);
				redoStacks[originSession] = [];
			}
		},
		reorderChild = function (parentIdea, newRank, oldRank) {
			parentIdea.ideas[newRank] = parentIdea.ideas[oldRank];
			delete parentIdea.ideas[oldRank];
		},
		upgrade = function (idea) {
			if (idea.style) {
				idea.attr = {};
				var collapsed = idea.style.collapsed;
				delete idea.style.collapsed;
				idea.attr.style = idea.style;
				if (collapsed) {
					idea.attr.collapsed = collapsed;
				}
				delete idea.style;
			}
			if (idea.ideas) {
				_.each(idea.ideas, upgrade);
			}
		},
		sessionFromId = function (id) {
			var dotIndex = String(id).indexOf('.');
			return dotIndex > 0 && id.substr(dotIndex + 1);
		},
		commandProcessors = {},
		configuration = {},
		uniqueResourcePostfix = '/xxxxxxxx-yxxx-yxxx-yxxx-xxxxxxxxxxxx/'.replace(/[xy]/g, function (c) {
			/*jshint bitwise: false*/
			// jscs:disable
			var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r&0x3|0x8);
			// jscs:enable
			return v.toString(16);
		}) + (sessionKey || ''),
		updateAttr = function (object, attrName, attrValue) {
			var oldAttr;
			if (!object) {
				return false;
			}
			oldAttr = _.extend({}, object.attr);
			object.attr = _.extend({}, object.attr);
			if (!attrValue || attrValue === 'false' || (_.isObject(attrValue) && _.isEmpty(attrValue))) {
				if (!object.attr[attrName]) {
					return false;
				}
				delete object.attr[attrName];
			} else {
				if (_.isEqual(object.attr[attrName], attrValue)) {
					return false;
				}
				object.attr[attrName] = JSON.parse(JSON.stringify(attrValue));
			}
			if (_.size(object.attr) === 0) {
				delete object.attr;
			}
			return function () {
				object.attr = oldAttr;
			};
		};



	contentAggregate.setConfiguration = function (config) {
		configuration = config || {};
	};
	contentAggregate.getSessionKey = function () {
		return sessionKey;
	};
	contentAggregate.nextSiblingId = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank,
			candidateSiblingRanks,
			siblingsAfter;
		if (!parentIdea) {
			return false;
		}
		currentRank = parentIdea.findChildRankById(subIdeaId);
		candidateSiblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
		siblingsAfter = _.reject(candidateSiblingRanks, function (k) {
			return Math.abs(k) <= Math.abs(currentRank);
		});
		if (siblingsAfter.length === 0) {
			return false;
		}
		return parentIdea.ideas[_.min(siblingsAfter, Math.abs)].id;
	};
	contentAggregate.sameSideSiblingIds = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank = parentIdea.findChildRankById(subIdeaId);
		return _.without(_.map(_.pick(parentIdea.ideas, sameSideSiblingRanks(parentIdea, currentRank)), function (i) {
			return i.id;
		}), subIdeaId);
	};
	contentAggregate.getAttrById = function (ideaId, attrName) {
		var idea = findIdeaById(ideaId);
		return idea && idea.getAttr(attrName);
	};
	contentAggregate.previousSiblingId = function (subIdeaId) {
		var parentIdea = contentAggregate.findParent(subIdeaId),
			currentRank,
			candidateSiblingRanks,
			siblingsBefore;
		if (!parentIdea) {
			return false;
		}
		currentRank = parentIdea.findChildRankById(subIdeaId);
		candidateSiblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
		siblingsBefore = _.reject(candidateSiblingRanks, function (k) {
			return Math.abs(k) >= Math.abs(currentRank);
		});
		if (siblingsBefore.length === 0) {
			return false;
		}
		return parentIdea.ideas[_.max(siblingsBefore, Math.abs)].id;
	};
	contentAggregate.clone = function (subIdeaId) {
		var toClone = (subIdeaId && subIdeaId != contentAggregate.id && contentAggregate.findSubIdeaById(subIdeaId)) || contentAggregate;
		return JSON.parse(JSON.stringify(toClone));
	};
	contentAggregate.cloneMultiple = function (subIdeaIdArray) {
		return _.map(subIdeaIdArray, contentAggregate.clone);
	};
	contentAggregate.calculatePath = function (ideaId, currentPath, potentialParent) {
		if (contentAggregate.id == ideaId) {
			return [];
		}
		currentPath = currentPath || [contentAggregate];
		potentialParent = potentialParent || contentAggregate;
		if (potentialParent.containsDirectChild(ideaId)) {
			return currentPath;
		}
		return _.reduce(
			potentialParent.ideas,
			function (result, child) {
				return result || contentAggregate.calculatePath(ideaId, [child].concat(currentPath), child);
			},
			false
		);
	};
	contentAggregate.getSubTreeIds = function (rootIdeaId) {
		var result = [],
			collectIds = function (idea) {
				if (_.isEmpty(idea.ideas)) {
					return [];
				}
				_.each(idea.sortedSubIdeas(), function (child) {
					collectIds(child);
					result.push(child.id);
				});
			};
		collectIds(contentAggregate.findSubIdeaById(rootIdeaId) || contentAggregate);
		return result;
	};
	contentAggregate.findParent = function (subIdeaId, parentIdea) {
		parentIdea = parentIdea || contentAggregate;
		if (parentIdea.containsDirectChild(subIdeaId)) {
			return parentIdea;
		}
		return _.reduce(
			parentIdea.ideas,
			function (result, child) {
				return result || contentAggregate.findParent(subIdeaId, child);
			},
			false
		);
	};

	/**** aggregate command processing methods ****/
	contentAggregate.startBatch = function (originSession) {
		var activeSession = originSession || sessionKey;
		contentAggregate.endBatch(originSession);
		batches[activeSession] = [];
	};
	contentAggregate.endBatch = function (originSession) {
		var activeSession = originSession || sessionKey,
			inBatch = batches[activeSession],
			batchArgs,
			batchUndoFunctions,
			undo;
		batches[activeSession] = undefined;
		if (_.isEmpty(inBatch)) {
			return;
		}
		if (_.size(inBatch) === 1) {
			logChange(inBatch[0].eventMethod, inBatch[0].eventArgs, inBatch[0].undoFunction, activeSession);
		} else {
			batchArgs = _.map(inBatch, function (event) {
				return [event.eventMethod].concat(event.eventArgs);
			});
			batchUndoFunctions = _.sortBy(
				_.map(inBatch, function (event) {
					return event.undoFunction;
				}),
				function (f, idx) {
					return -1 * idx;
				}
			);
			undo = function () {
				_.each(batchUndoFunctions, function (eventUndo) {
					eventUndo();
				});
			};
			logChange('batch', batchArgs, undo, activeSession);
		}
	};
	contentAggregate.execCommand = function (cmd, args, originSession) {
		if (!commandProcessors[cmd]) {
			return false;
		}
		return commandProcessors[cmd].apply(contentAggregate, [originSession || sessionKey].concat(_.toArray(args)));
	};

	contentAggregate.batch = function (batchOp) {
		contentAggregate.startBatch();
		try {
			batchOp();
		}
		finally {
			contentAggregate.endBatch();
		}
	};

	commandProcessors.batch = function (originSession) {
		contentAggregate.startBatch(originSession);
		try {
			_.each(_.toArray(arguments).slice(1), function (event) {
				contentAggregate.execCommand(event[0], event.slice(1), originSession);
			});
		}
		finally {
			contentAggregate.endBatch(originSession);
		}
	};
	contentAggregate.pasteMultiple = function (parentIdeaId, jsonArrayToPaste) {
		contentAggregate.startBatch();
		var results = _.map(jsonArrayToPaste, function (json) {
			return contentAggregate.paste(parentIdeaId, json);
		});
		contentAggregate.endBatch();
		return results;
	};

	contentAggregate.paste = function (parentIdeaId, jsonToPaste, initialId) {
		return contentAggregate.execCommand('paste', arguments);
	};
	commandProcessors.paste = function (originSession, parentIdeaId, jsonToPaste, initialId) {
		var pasteParent = (parentIdeaId == contentAggregate.id) ?  contentAggregate : contentAggregate.findSubIdeaById(parentIdeaId),
			cleanUp = function (json) {
				var result =  _.omit(json, 'ideas', 'id', 'attr'), index = 1, childKeys, sortedChildKeys;
				result.attr = _.omit(json.attr, configuration.nonClonedAttributes);
				if (_.isEmpty(result.attr)) {
					delete result.attr;
				}
				if (json.ideas) {
					childKeys = _.groupBy(_.map(_.keys(json.ideas), parseFloat), function (key) {
						return key > 0;
					});
					sortedChildKeys = _.sortBy(childKeys[true], Math.abs).concat(_.sortBy(childKeys[false], Math.abs));
					result.ideas = {};
					_.each(sortedChildKeys, function (key) {
						result.ideas[index++] = cleanUp(json.ideas[key]);
					});
				}
				return result;
			},
			newIdea,
			newRank,
			oldPosition;
		if (initialId) {
			cachedId = parseInt(initialId, 10) - 1;
		}
		newIdea =  jsonToPaste && (jsonToPaste.title || jsonToPaste.attr) && init(cleanUp(jsonToPaste), sessionFromId(initialId));
		if (!pasteParent || !newIdea) {
			return false;
		}
		newRank = appendSubIdea(pasteParent, newIdea);
		if (initialId) {
			invalidateIdCache();
		}
		updateAttr(newIdea, 'position');
		logChange('paste', [parentIdeaId, jsonToPaste, newIdea.id], function () {
			delete pasteParent.ideas[newRank];
		}, originSession);
		return newIdea.id;
	};
	contentAggregate.flip = function (ideaId) {
		return contentAggregate.execCommand('flip', arguments);
	};
	commandProcessors.flip = function (originSession, ideaId) {
		var newRank, maxRank, currentRank = contentAggregate.findChildRankById(ideaId);
		if (!currentRank) {
			return false;
		}
		maxRank = maxKey(contentAggregate.ideas, -1 * sign(currentRank));
		newRank = maxRank - 10 * sign(currentRank);
		reorderChild(contentAggregate, newRank, currentRank);
		logChange('flip', [ideaId], function () {
			reorderChild(contentAggregate, currentRank, newRank);
		}, originSession);
		return true;
	};
	contentAggregate.initialiseTitle = function (ideaId, title) {
		return contentAggregate.execCommand('initialiseTitle', arguments);
	};
	commandProcessors.initialiseTitle = function (originSession, ideaId, title) {
		var idea = findIdeaById(ideaId), originalTitle;
		if (!idea) {
			return false;
		}
		originalTitle = idea.title;
		if (originalTitle == title) {
			return false;
		}
		idea.title = title;
		appendChange('initialiseTitle', [ideaId, title], function () {
			idea.title = originalTitle;
		}, originSession);
		return true;
	};
	contentAggregate.updateTitle = function (ideaId, title) {
		return contentAggregate.execCommand('updateTitle', arguments);
	};
	commandProcessors.updateTitle = function (originSession, ideaId, title) {
		var idea = findIdeaById(ideaId), originalTitle;
		if (!idea) {
			return false;
		}
		originalTitle = idea.title;
		if (originalTitle == title) {
			return false;
		}
		idea.title = title;
		logChange('updateTitle', [ideaId, title], function () {
			idea.title = originalTitle;
		}, originSession);
		return true;
	};
	contentAggregate.addSubIdea = function (parentId, ideaTitle, optionalNewId) {
		return contentAggregate.execCommand('addSubIdea', arguments);
	};
	commandProcessors.addSubIdea = function (originSession, parentId, ideaTitle, optionalNewId) {
		var idea, parent = findIdeaById(parentId), newRank;
		if (!parent) {
			return false;
		}
		if (optionalNewId && findIdeaById(optionalNewId)) {
			return false;
		}
		idea = init({
			title: ideaTitle,
			id: optionalNewId
		});
		newRank = appendSubIdea(parent, idea);
		logChange('addSubIdea', [parentId, ideaTitle, idea.id], function () {
			delete parent.ideas[newRank];
		}, originSession);
		return idea.id;
	};
	contentAggregate.removeMultiple = function (subIdeaIdArray) {
		contentAggregate.startBatch();
		var results = _.map(subIdeaIdArray, contentAggregate.removeSubIdea);
		contentAggregate.endBatch();
		return results;
	};
	contentAggregate.removeSubIdea = function (subIdeaId) {
		return contentAggregate.execCommand('removeSubIdea', arguments);
	};
	commandProcessors.removeSubIdea = function (originSession, subIdeaId) {
		var parent = contentAggregate.findParent(subIdeaId), oldRank, oldIdea, oldLinks;
		if (parent) {
			oldRank = parent.findChildRankById(subIdeaId);
			oldIdea = parent.ideas[oldRank];
			delete parent.ideas[oldRank];
			oldLinks = contentAggregate.links;
			contentAggregate.links = _.reject(contentAggregate.links, function (link) {
				return link.ideaIdFrom == subIdeaId || link.ideaIdTo == subIdeaId;
			});
			logChange('removeSubIdea', [subIdeaId], function () {
				parent.ideas[oldRank] = oldIdea;
				contentAggregate.links = oldLinks;
			}, originSession);
			return true;
		}
		return false;
	};
	contentAggregate.insertIntermediateMultiple = function (idArray) {
		contentAggregate.startBatch();
		var newId = contentAggregate.insertIntermediate(idArray[0]);
		_.each(idArray.slice(1), function (id) {
			contentAggregate.changeParent(id, newId);
		});
		contentAggregate.endBatch();
		return newId;
	};
	contentAggregate.insertIntermediate = function (inFrontOfIdeaId, title, optionalNewId) {
		return contentAggregate.execCommand('insertIntermediate', arguments);
	};
	commandProcessors.insertIntermediate = function (originSession, inFrontOfIdeaId, title, optionalNewId) {
		if (contentAggregate.id == inFrontOfIdeaId) {
			return false;
		}
		var childRank, oldIdea, newIdea, parentIdea = contentAggregate.findParent(inFrontOfIdeaId);
		if (!parentIdea) {
			return false;
		}
		if (optionalNewId && findIdeaById(optionalNewId)) {
			return false;
		}
		childRank = parentIdea.findChildRankById(inFrontOfIdeaId);
		if (!childRank) {
			return false;
		}
		oldIdea = parentIdea.ideas[childRank];
		newIdea = init({
			title: title,
			id: optionalNewId
		});
		parentIdea.ideas[childRank] = newIdea;
		newIdea.ideas = {
			1: oldIdea
		};
		logChange('insertIntermediate', [inFrontOfIdeaId, title, newIdea.id], function () {
			parentIdea.ideas[childRank] = oldIdea;
		}, originSession);
		return newIdea.id;
	};
	contentAggregate.changeParent = function (ideaId, newParentId) {
		return contentAggregate.execCommand('changeParent', arguments);
	};
	commandProcessors.changeParent = function (originSession, ideaId, newParentId) {
		var oldParent, oldRank, newRank, idea, parent = findIdeaById(newParentId), oldPosition;
		if (ideaId == newParentId) {
			return false;
		}
		if (!parent) {
			return false;
		}
		idea = contentAggregate.findSubIdeaById(ideaId);
		if (!idea) {
			return false;
		}
		if (idea.findSubIdeaById(newParentId)) {
			return false;
		}
		if (parent.containsDirectChild(ideaId)) {
			return false;
		}
		oldParent = contentAggregate.findParent(ideaId);
		if (!oldParent) {
			return false;
		}
		oldRank = oldParent.findChildRankById(ideaId);
		newRank = appendSubIdea(parent, idea);
		oldPosition = idea.getAttr('position');
		updateAttr(idea, 'position');
		delete oldParent.ideas[oldRank];
		logChange('changeParent', [ideaId, newParentId], function () {
			updateAttr(idea, 'position', oldPosition);
			oldParent.ideas[oldRank] = idea;
			delete parent.ideas[newRank];
		}, originSession);
		return true;
	};
	contentAggregate.mergeAttrProperty = function (ideaId, attrName, attrPropertyName, attrPropertyValue) {
		var val = contentAggregate.getAttrById(ideaId, attrName) || {};
		if (attrPropertyValue) {
			val[attrPropertyName] = attrPropertyValue;
		} else {
			delete val[attrPropertyName];
		}
		if (_.isEmpty(val)) {
			val = false;
		}
		return contentAggregate.updateAttr(ideaId, attrName, val);
	};
	contentAggregate.updateAttr = function (ideaId, attrName, attrValue) {
		return contentAggregate.execCommand('updateAttr', arguments);
	};
	commandProcessors.updateAttr = function (originSession, ideaId, attrName, attrValue) {
		var idea = findIdeaById(ideaId), undoAction;
		undoAction = updateAttr(idea, attrName, attrValue);
		if (undoAction) {
			logChange('updateAttr', [ideaId, attrName, attrValue], undoAction, originSession);
		}
		return !!undoAction;
	};
	contentAggregate.moveRelative = function (ideaId, relativeMovement) {
		var parentIdea = contentAggregate.findParent(ideaId),
			currentRank = parentIdea && parentIdea.findChildRankById(ideaId),
			siblingRanks = currentRank && _.sortBy(sameSideSiblingRanks(parentIdea, currentRank), Math.abs),
			currentIndex = siblingRanks && siblingRanks.indexOf(currentRank),
			/* we call positionBefore, so movement down is actually 2 spaces, not 1 */
			newIndex = currentIndex + (relativeMovement > 0 ? relativeMovement + 1 : relativeMovement),
			beforeSibling = (newIndex >= 0) && parentIdea && siblingRanks && parentIdea.ideas[siblingRanks[newIndex]];
		if (newIndex < 0 || !parentIdea) {
			return false;
		}
		return contentAggregate.positionBefore(ideaId, beforeSibling && beforeSibling.id, parentIdea);
	};
	contentAggregate.positionBefore = function (ideaId, positionBeforeIdeaId, parentIdea) {
		return contentAggregate.execCommand('positionBefore', arguments);
	};
	commandProcessors.positionBefore = function (originSession, ideaId, positionBeforeIdeaId, parentIdea) {
		parentIdea = parentIdea || contentAggregate;
		var newRank, afterRank, siblingRanks, candidateSiblings, beforeRank, maxRank, currentRank;
		currentRank = parentIdea.findChildRankById(ideaId);
		if (!currentRank) {
			return _.reduce(
				parentIdea.ideas,
				function (result, idea) {
					return result || commandProcessors.positionBefore(originSession, ideaId, positionBeforeIdeaId, idea);
				},
				false
			);
		}
		if (ideaId == positionBeforeIdeaId) {
			return false;
		}
		newRank = 0;
		if (positionBeforeIdeaId) {
			afterRank = parentIdea.findChildRankById(positionBeforeIdeaId);
			if (!afterRank) {
				return false;
			}
			siblingRanks = sameSideSiblingRanks(parentIdea, currentRank);
			candidateSiblings = _.reject(_.sortBy(siblingRanks, Math.abs), function (k) {
				return Math.abs(k) >= Math.abs(afterRank);
			});
			beforeRank = candidateSiblings.length > 0 ? _.max(candidateSiblings, Math.abs) : 0;
			if (beforeRank == currentRank) {
				return false;
			}
			newRank = beforeRank + (afterRank - beforeRank) / 2;
		} else {
			maxRank = maxKey(parentIdea.ideas, currentRank < 0 ? -1 : 1);
			if (maxRank == currentRank) {
				return false;
			}
			newRank = maxRank + 10 * (currentRank < 0 ? -1 : 1);
		}
		if (newRank == currentRank) {
			return false;
		}
		reorderChild(parentIdea, newRank, currentRank);
		logChange('positionBefore', [ideaId, positionBeforeIdeaId], function () {
			reorderChild(parentIdea, currentRank, newRank);
		}, originSession);
		return true;
	};
	observable(contentAggregate);
	(function () {
		var isLinkValid = function (ideaIdFrom, ideaIdTo) {
			var isParentChild, ideaFrom, ideaTo;
			if (ideaIdFrom === ideaIdTo) {
				return false;
			}
			ideaFrom = findIdeaById(ideaIdFrom);
			if (!ideaFrom) {
				return false;
			}
			ideaTo = findIdeaById(ideaIdTo);
			if (!ideaTo) {
				return false;
			}
			isParentChild = _.find(
				ideaFrom.ideas,
				function (node) {
					return node.id === ideaIdTo;
				}
			) || _.find(
				ideaTo.ideas,
				function (node) {
					return node.id === ideaIdFrom;
				}
			);
			if (isParentChild) {
				return false;
			}
			return true;
		};
		contentAggregate.addLink = function (ideaIdFrom, ideaIdTo) {
			return contentAggregate.execCommand('addLink', arguments);
		};
		commandProcessors.addLink = function (originSession, ideaIdFrom, ideaIdTo) {
			var alreadyExists, link;
			if (!isLinkValid(ideaIdFrom, ideaIdTo)) {
				return false;
			}
			alreadyExists = _.find(
				contentAggregate.links,
				function (link) {
					return (link.ideaIdFrom === ideaIdFrom && link.ideaIdTo === ideaIdTo) || (link.ideaIdFrom === ideaIdTo && link.ideaIdTo === ideaIdFrom);
				}
			);
			if (alreadyExists) {
				return false;
			}
			contentAggregate.links = contentAggregate.links || [];
			link = {
				ideaIdFrom: ideaIdFrom,
				ideaIdTo: ideaIdTo,
				attr: {
					style: {
						color: '#FF0000',
						lineStyle: 'dashed'
					}
				}
			};
			contentAggregate.links.push(link);
			logChange('addLink', [ideaIdFrom, ideaIdTo], function () {
				contentAggregate.links.pop();
			}, originSession);
			return true;
		};
		contentAggregate.removeLink = function (ideaIdOne, ideaIdTwo) {
			return contentAggregate.execCommand('removeLink', arguments);
		};
		commandProcessors.removeLink = function (originSession, ideaIdOne, ideaIdTwo) {
			var i = 0, link;

			while (contentAggregate.links && i < contentAggregate.links.length) {
				link = contentAggregate.links[i];
				if (String(link.ideaIdFrom) === String(ideaIdOne) && String(link.ideaIdTo) === String(ideaIdTwo)) {
					contentAggregate.links.splice(i, 1);
					logChange('removeLink', [ideaIdOne, ideaIdTwo], function () {
						contentAggregate.links.push(_.clone(link));
					}, originSession);
					return true;
				}
				i += 1;
			}
			return false;
		};
		contentAggregate.getLinkAttr = function (ideaIdFrom, ideaIdTo, name) {
			var link = _.find(
				contentAggregate.links,
				function (link) {
					return link.ideaIdFrom == ideaIdFrom && link.ideaIdTo == ideaIdTo;
				}
			);
			if (link && link.attr && link.attr[name]) {
				return link.attr[name];
			}
			return false;
		};
		contentAggregate.updateLinkAttr = function (ideaIdFrom, ideaIdTo, attrName, attrValue) {
			return contentAggregate.execCommand('updateLinkAttr', arguments);
		};
		commandProcessors.updateLinkAttr = function (originSession, ideaIdFrom, ideaIdTo, attrName, attrValue) {
			var link = _.find(
				contentAggregate.links,
				function (link) {
					return link.ideaIdFrom == ideaIdFrom && link.ideaIdTo == ideaIdTo;
				}
			), undoAction;
			undoAction = updateAttr(link, attrName, attrValue);
			if (undoAction) {
				logChange('updateLinkAttr', [ideaIdFrom, ideaIdTo, attrName, attrValue], undoAction, originSession);
			}
			return !!undoAction;
		};
	}());
	/* undo/redo */
	contentAggregate.undo = function () {
		return contentAggregate.execCommand('undo', arguments);
	};
	commandProcessors.undo = function (originSession) {
		contentAggregate.endBatch();
		var topEvent;
		topEvent = eventStacks[originSession] && eventStacks[originSession].pop();
		if (topEvent && topEvent.undoFunction) {
			topEvent.undoFunction();
			if (!redoStacks[originSession]) {
				redoStacks[originSession] = [];
			}
			redoStacks[originSession].push(topEvent);
			contentAggregate.dispatchEvent('changed', 'undo', [], originSession);
			return true;
		}
		return false;
	};
	contentAggregate.redo = function () {
		return contentAggregate.execCommand('redo', arguments);
	};
	commandProcessors.redo = function (originSession) {
		contentAggregate.endBatch();
		var topEvent;
		topEvent = redoStacks[originSession] && redoStacks[originSession].pop();
		if (topEvent) {
			isRedoInProgress = true;
			contentAggregate.execCommand(topEvent.eventMethod, topEvent.eventArgs, originSession);
			isRedoInProgress = false;
			return true;
		}
		return false;
	};
	contentAggregate.storeResource = function (/*resourceBody, optionalKey*/) {
		return contentAggregate.execCommand('storeResource', arguments);
	};
	commandProcessors.storeResource = function (originSession, resourceBody, optionalKey) {
		var existingId, id,
			maxIdForSession = function () {
				if (_.isEmpty(contentAggregate.resources)) {
					return 0;
				}
				var toInt = function (string) {
						return parseInt(string, 10);
					},
					keys = _.keys(contentAggregate.resources),
					filteredKeys = sessionKey ? _.filter(keys, RegExp.prototype.test.bind(new RegExp('\\/' + sessionKey + '$'))) : keys,
					intKeys = _.map(filteredKeys, toInt);
				return _.isEmpty(intKeys) ? 0 : _.max(intKeys);
			},
			nextResourceId = function () {
				var intId = maxIdForSession() + 1;
				return intId + uniqueResourcePostfix;
			};

		if (!optionalKey && contentAggregate.resources) {
			existingId = _.find(_.keys(contentAggregate.resources), function (key) {
				return contentAggregate.resources[key] === resourceBody;
			});
			if (existingId) {
				return existingId;
			}
		}
		id = optionalKey || nextResourceId();
		contentAggregate.resources = contentAggregate.resources || {};
		contentAggregate.resources[id] = resourceBody;
		contentAggregate.dispatchEvent('resourceStored', resourceBody, id, originSession);
		return id;
	};
	contentAggregate.getResource = function (id) {
		return contentAggregate.resources && contentAggregate.resources[id];
	};
	contentAggregate.hasSiblings = function (id) {
		if (id === contentAggregate.id) {
			return false;
		}
		var parent = contentAggregate.findParent(id);
		return parent && _.size(parent.ideas) > 1;
	};
	if (contentAggregate.formatVersion != 2) {
		upgrade(contentAggregate);
		contentAggregate.formatVersion = 2;
	}
	init(contentAggregate);
	return contentAggregate;
};
/*jslint nomen: true*/
/*global _, Color, MAPJS*/
MAPJS.defaultStyles = { };
MAPJS.layoutLinks = function (idea, visibleNodes) {
	'use strict';
	var result = {};
	_.each(idea.links, function (link) {
		if (visibleNodes[link.ideaIdFrom] && visibleNodes[link.ideaIdTo]) {
			result[link.ideaIdFrom + '_' + link.ideaIdTo] = {
				ideaIdFrom: link.ideaIdFrom,
				ideaIdTo: link.ideaIdTo,
				attr: _.clone(link.attr)
			};
			//todo - clone
		}
	});
	return result;
};
MAPJS.calculateFrame = function (nodes, margin) {
	'use strict';
	margin = margin || 0;
	var result = {
		top: _.min(nodes, function (node) {
			return node.y;
		}).y - margin,
		left: _.min(nodes, function (node) {
			return node.x;
		}).x - margin
	};
	result.width = margin + _.max(_.map(nodes, function (node) {
		return node.x + node.width;
	})) - result.left;
	result.height = margin + _.max(_.map(nodes, function (node) {
		return node.y + node.height;
	})) - result.top;
	return result;
};
MAPJS.contrastForeground = function (background) {
	'use strict';
	/*jslint newcap:true*/
	var luminosity = Color(background).luminosity();
	if (luminosity < 0.5) {
		return '#EEEEEE';
	}
	if (luminosity < 0.9) {
		return '#4F4F4F';
	}
	return '#000000';
};
MAPJS.Outline = function (topBorder, bottomBorder) {
	'use strict';
	var shiftBorder = function (border, deltaH) {
		return _.map(border, function (segment) {
			return {
				l: segment.l,
				h: segment.h + deltaH
			};
		});
	};
	this.initialHeight = function () {
		return this.bottom[0].h - this.top[0].h;
	};
	this.borders = function () {
		return _.pick(this, 'top', 'bottom');
	};
	this.spacingAbove = function (outline) {
		var i = 0, j = 0, result = 0, li = 0, lj = 0;
		while (i < this.bottom.length && j < outline.top.length) {
			result = Math.max(result, this.bottom[i].h - outline.top[j].h);
			if (li + this.bottom[i].l < lj + outline.top[j].l) {
				li += this.bottom[i].l;
				i += 1;
			} else if (li + this.bottom[i].l === lj + outline.top[j].l) {
				li += this.bottom[i].l;
				i += 1;
				lj += outline.top[j].l;
				j += 1;
			} else {
				lj += outline.top[j].l;
				j += 1;
			}
		}
		return result;
	};
	this.indent = function (horizontalIndent, margin) {
		if (!horizontalIndent) {
			return this;
		}
		var top = this.top.slice(),
			bottom = this.bottom.slice(),
			vertCenter = (bottom[0].h + top[0].h) / 2;
		top.unshift({h: vertCenter - margin / 2, l: horizontalIndent});
		bottom.unshift({h: vertCenter + margin / 2, l: horizontalIndent});
		return new MAPJS.Outline(top, bottom);
	};
	this.stackBelow = function (outline, margin) {
		var spacing = outline.spacingAbove(this),
			top = MAPJS.Outline.extendBorder(outline.top, shiftBorder(this.top, spacing + margin)),
			bottom = MAPJS.Outline.extendBorder(shiftBorder(this.bottom, spacing + margin), outline.bottom);
		return new MAPJS.Outline(
			top,
			bottom
		);
	};
	this.expand = function (initialTopHeight, initialBottomHeight) {
		var topAlignment = initialTopHeight - this.top[0].h,
			bottomAlignment = initialBottomHeight - this.bottom[0].h,
			top = shiftBorder(this.top, topAlignment),
			bottom = shiftBorder(this.bottom, bottomAlignment);
		return new MAPJS.Outline(
			top,
			bottom
		);
	};
	this.insertAtStart = function (dimensions, margin) {
		var alignment = 0, //-1 * this.top[0].h - suboutlineHeight * 0.5,
			topBorder = shiftBorder(this.top, alignment),
			bottomBorder = shiftBorder(this.bottom, alignment),
			easeIn = function (border) {
				border[0].l *= 0.5;
				border[1].l += border[0].l;
			};
		topBorder[0].l += margin;
		bottomBorder[0].l += margin;
		topBorder.unshift({h: -0.5 * dimensions.height, l: dimensions.width});
		bottomBorder.unshift({h: 0.5 * dimensions.height, l: dimensions.width});
		if (topBorder[0].h > topBorder[1].h) {
			easeIn(topBorder);
		}
		if (bottomBorder[0].h < bottomBorder[1].h) {
			easeIn(bottomBorder);
		}
		return new MAPJS.Outline(topBorder, bottomBorder);
	};
	this.top = topBorder.slice();
	this.bottom = bottomBorder.slice();
};
MAPJS.Outline.borderLength = function (border) {
	'use strict';
	return _.reduce(border, function (seed, el) {
		return seed + el.l;
	}, 0);
};
MAPJS.Outline.borderSegmentIndexAt = function (border, length) {
	'use strict';
	var l = 0, i = -1;
	while (l <= length) {
		i += 1;
		if (i >= border.length) {
			return -1;
		}
		l += border[i].l;
	}
	return i;
};
MAPJS.Outline.extendBorder = function (originalBorder, extension) {
	'use strict';
	var result = originalBorder.slice(),
		origLength = MAPJS.Outline.borderLength(originalBorder),
		i = MAPJS.Outline.borderSegmentIndexAt(extension, origLength),
		lengthToCut;
	if (i >= 0) {
		lengthToCut = MAPJS.Outline.borderLength(extension.slice(0, i + 1));
		result.push({h: extension[i].h, l: lengthToCut - origLength});
		result = result.concat(extension.slice(i + 1));
	}
	return result;
};
MAPJS.Tree = function (options) {
	'use strict';
	_.extend(this, options);
	this.toLayout = function (x, y, parentId) {
		x = x || 0;
		y = y || 0;
		var result = {
			nodes: {},
			connectors: {}
		}, self;
		self = _.pick(this, 'id', 'title', 'attr', 'width', 'height', 'level');
		if (self.level === 1) {
			self.x = -0.5 * this.width;
			self.y = -0.5 * this.height;
		} else {
			self.x = x + this.deltaX || 0;
			self.y = y + this.deltaY || 0;
		}
		result.nodes[this.id] = self;
		if (parentId !== undefined) {
			result.connectors[self.id] = {
				from: parentId,
				to: self.id
			};
		}
		if (this.subtrees) {
			this.subtrees.forEach(function (t) {
				var subLayout = t.toLayout(self.x, self.y, self.id);
				_.extend(result.nodes, subLayout.nodes);
				_.extend(result.connectors, subLayout.connectors);
			});
		}
		return result;
	};
};
MAPJS.Outline.fromDimensions = function (dimensions) {
	'use strict';
	return new MAPJS.Outline([{
		h: -0.5 * dimensions.height,
		l: dimensions.width
	}], [{
		h: 0.5 * dimensions.height,
		l: dimensions.width
	}]);
};
MAPJS.calculateTree = function (content, dimensionProvider, margin, rankAndParentPredicate, level) {
	'use strict';
	var options = {
		id: content.id,
		title: content.title,
		attr: content.attr,
		deltaY: 0,
		deltaX: 0,
		level: level || 1
	},
		setVerticalSpacing = function (treeArray,  dy) {
			var i,
				tree,
				oldSpacing,
				newSpacing,
				oldPositions = _.map(treeArray, function (t) {
					return _.pick(t, 'deltaX', 'deltaY');
				}),
				referenceTree,
				alignment;
			for (i = 0; i < treeArray.length; i += 1) {
				tree = treeArray[i];
				if (tree.attr && tree.attr.position) {
					tree.deltaY = tree.attr.position[1];
					if (referenceTree === undefined || tree.attr.position[2] > treeArray[referenceTree].attr.position[2]) {
						referenceTree = i;
					}
				} else {
					tree.deltaY += dy;
				}
				if (i > 0) {
					oldSpacing = oldPositions[i].deltaY - oldPositions[i - 1].deltaY;
					newSpacing = treeArray[i].deltaY - treeArray[i - 1].deltaY;
					if (newSpacing < oldSpacing) {
						tree.deltaY += oldSpacing - newSpacing;
					}
				}
			}
			alignment =  referenceTree && (treeArray[referenceTree].attr.position[1] - treeArray[referenceTree].deltaY);
			if (alignment) {
				for (i = 0; i < treeArray.length; i += 1) {
					treeArray[i].deltaY += alignment;
				}
			}
		},
		shouldIncludeSubIdeas = function () {
			return !(_.isEmpty(content.ideas) || (content.attr && content.attr.collapsed));
		},
		includedSubIdeaKeys = function () {
			var allRanks = _.map(_.keys(content.ideas), parseFloat),
				includedRanks = rankAndParentPredicate ? _.filter(allRanks, function (rank) {
					return rankAndParentPredicate(rank, content.id);
				}) : allRanks;
			return _.sortBy(includedRanks, Math.abs);
		},
		includedSubIdeas = function () {
			var result = [];
			_.each(includedSubIdeaKeys(), function (key) {
				result.push(content.ideas[key]);
			});
			return result;
		},
		nodeDimensions = dimensionProvider(content, options.level),
		appendSubtrees = function (subtrees) {
			var suboutline, deltaHeight, subtreePosition, horizontal, treeOutline;
			_.each(subtrees, function (subtree) {
				subtree.deltaX = nodeDimensions.width + margin;
				subtreePosition = subtree.attr && subtree.attr.position && subtree.attr.position[0];
				if (subtreePosition && subtreePosition > subtree.deltaX) {
					horizontal = subtreePosition - subtree.deltaX;
					subtree.deltaX = subtreePosition;
				} else {
					horizontal = 0;
				}
				if (!suboutline) {
					suboutline = subtree.outline.indent(horizontal, margin);
				} else {
					treeOutline = subtree.outline.indent(horizontal, margin);
					deltaHeight = treeOutline.initialHeight();
					suboutline = treeOutline.stackBelow(suboutline, margin);
					subtree.deltaY = suboutline.initialHeight() - deltaHeight / 2 - subtree.height / 2;
				}
			});
			if (subtrees && subtrees.length) {
				setVerticalSpacing(subtrees, 0.5 * (nodeDimensions.height  - suboutline.initialHeight()));
				suboutline = suboutline.expand(
					subtrees[0].deltaY - nodeDimensions.height * 0.5,
					subtrees[subtrees.length - 1].deltaY + subtrees[subtrees.length - 1].height - nodeDimensions.height * 0.5
				);
			}
			options.outline = suboutline.insertAtStart(nodeDimensions, margin);
		};
	_.extend(options, nodeDimensions);
	options.outline = new MAPJS.Outline.fromDimensions(nodeDimensions);
	if (shouldIncludeSubIdeas()) {
		options.subtrees = _.map(includedSubIdeas(), function (i) {
			return MAPJS.calculateTree(i, dimensionProvider, margin, rankAndParentPredicate, options.level + 1);
		});
		if (!_.isEmpty(options.subtrees)) {
			appendSubtrees(options.subtrees);
		}
	}
	return new MAPJS.Tree(options);
};

MAPJS.calculateLayout = function (idea, dimensionProvider, margin) {
	'use strict';
	var positiveTree, negativeTree, layout, negativeLayout,
		setDefaultStyles = function (nodes) {
			_.each(nodes, function (node) {
				node.attr = node.attr || {};
				node.attr.style = _.extend({}, MAPJS.defaultStyles[(node.level === 1) ? 'root' : 'nonRoot'], node.attr.style);
			});
		},
		positive = function (rank, parentId) {
			return parentId !== idea.id || rank > 0;
		},
		negative = function (rank, parentId) {
			return parentId !== idea.id || rank < 0;
		};
	margin = margin || 20;
	positiveTree = MAPJS.calculateTree(idea, dimensionProvider, margin, positive);
	negativeTree = MAPJS.calculateTree(idea, dimensionProvider, margin, negative);
	layout = positiveTree.toLayout();
	negativeLayout = negativeTree.toLayout();
	_.each(negativeLayout.nodes, function (n) {
		n.x = -1 * n.x - n.width;
	});
	_.extend(negativeLayout.nodes, layout.nodes);
	_.extend(negativeLayout.connectors, layout.connectors);
	setDefaultStyles(negativeLayout.nodes);
	negativeLayout.links = MAPJS.layoutLinks(idea, negativeLayout.nodes);
	negativeLayout.rootNodeId = idea.id;
	return negativeLayout;
};

/*global MAPJS*/
MAPJS.MemoryClipboard = function () {
	'use strict';
	var self = this,
		clone = function (something) {
			if (!something) {
				return undefined;
			}
			return JSON.parse(JSON.stringify(something));
		},
		contents;
	self.get = function () {
		return clone(contents);
	};
	self.put = function (c) {
		contents = clone(c);
	};
};
/*global $, Hammer*/
/*jslint newcap:true*/
(function () {
	'use strict';
	$.fn.simpleDraggableContainer = function () {
		var currentDragObject,
			originalDragObjectPosition,
			container = this,
			drag = function (event) {

				if (currentDragObject && event.gesture) {
					var newpos = {
							top: Math.round(parseInt(originalDragObjectPosition.top, 10) + event.gesture.deltaY),
							left: Math.round(parseInt(originalDragObjectPosition.left, 10) + event.gesture.deltaX)
						};
					currentDragObject.css(newpos).trigger($.Event('mm:drag', {currentPosition: newpos, gesture: event.gesture}));
					if (event.gesture) {
						event.gesture.preventDefault();
					}
					return false;
				}
			},
			rollback = function (e) {
				var target = currentDragObject; // allow it to be cleared while animating
				if (target.attr('mapjs-drag-role') !== 'shadow') {
					target.animate(originalDragObjectPosition, {
						complete: function () {
							target.trigger($.Event('mm:cancel-dragging', {gesture: e.gesture}));
						},
						progress: function () {
							target.trigger('mm:drag');
						}
					});
				} else {
					target.trigger($.Event('mm:cancel-dragging', {gesture: e.gesture}));
				}
			};
		Hammer(this, {'drag_min_distance': 2});
		return this.on('mm:start-dragging', function (event) {
			if (!currentDragObject) {
				currentDragObject = $(event.relatedTarget);
				originalDragObjectPosition = {
					top: currentDragObject.css('top'),
					left: currentDragObject.css('left')
				};
				$(this).on('drag', drag);
			}
		}).on('mm:start-dragging-shadow', function (event) {
			var target = $(event.relatedTarget),
				clone = function () {
					var result = target.clone().addClass('drag-shadow').appendTo(container).offset(target.offset()).data(target.data()).attr('mapjs-drag-role', 'shadow'),
						scale = target.parent().data('scale') || 1;
					if (scale !== 0) {
						result.css({
							'transform': 'scale(' + scale + ')',
							'transform-origin': 'top left'
						});
					}
					return result;
				};
			if (!currentDragObject) {
				currentDragObject = clone();
				originalDragObjectPosition = {
					top: currentDragObject.css('top'),
					left: currentDragObject.css('left')
				};
				currentDragObject.on('mm:stop-dragging mm:cancel-dragging', function (e) {
					this.remove();
					e.stopPropagation();
					e.stopImmediatePropagation();
					var evt = $.Event(e.type, {
						gesture: e.gesture,
						finalPosition: e.finalPosition
					});
					target.trigger(evt);
				}).on('mm:drag', function (e) {
					target.trigger(e);
				});
				$(this).on('drag', drag);
			}
		}).on('dragend', function (e) {
			$(this).off('drag', drag);
			if (currentDragObject) {
				var evt = $.Event('mm:stop-dragging', {
					gesture: e.gesture,
					finalPosition: currentDragObject.offset()
				});
				currentDragObject.trigger(evt);
				if (evt.result === false) {
					rollback(e);
				}
				currentDragObject = undefined;
			}
		}).on('mouseleave', function (e) {
			if (currentDragObject) {
				$(this).off('drag', drag);
				rollback(e);
				currentDragObject = undefined;
			}
		}).attr('data-drag-role', 'container');
	};

	var onDrag = function (e) {
			$(this).trigger(
				$.Event('mm:start-dragging', {
					relatedTarget: this,
					gesture: e.gesture
				})
			);
			e.stopPropagation();
			e.preventDefault();
			if (e.gesture) {
				e.gesture.stopPropagation();
				e.gesture.preventDefault();
			}
		}, onShadowDrag = function (e) {
			$(this).trigger(
				$.Event('mm:start-dragging-shadow', {
					relatedTarget: this,
					gesture: e.gesture
				})
			);
			e.stopPropagation();
			e.preventDefault();
			if (e.gesture) {
				e.gesture.stopPropagation();
				e.gesture.preventDefault();
			}
		};
	$.fn.simpleDraggable = function (options) {
		if (!options || !options.disable) {
			return $(this).on('dragstart', onDrag);
		} else {
			return $(this).off('dragstart', onDrag);
		}
	};
	$.fn.shadowDraggable = function (options) {
		if (!options || !options.disable) {
			return $(this).on('dragstart', onShadowDrag);
		} else {
			return $(this).off('dragstart', onShadowDrag);
		}
	};
})();
/*jslint forin: true, nomen: true*/
/*global _, MAPJS, observable*/
MAPJS.MapModel = function (layoutCalculatorArg, selectAllTitles, clipboardProvider, defaultReorderMargin) {
	'use strict';
	var self = this,
		layoutCalculator = layoutCalculatorArg,
		reorderMargin = defaultReorderMargin || 20,
		clipboard = clipboardProvider || new MAPJS.MemoryClipboard(),
		analytic,
		currentLayout = {
			nodes: {},
			connectors: {}
		},
		idea,
		currentLabelGenerator,
		isInputEnabled = true,
		isEditingEnabled = true,
		currentlySelectedIdeaId,
		activatedNodes = [],
		setActiveNodes = function (activated) {
			var wasActivated = _.clone(activatedNodes);
			if (activated.length === 0) {
				activatedNodes = [currentlySelectedIdeaId];
			} else {
				activatedNodes = activated;
			}
			self.dispatchEvent('activatedNodesChanged', _.difference(activatedNodes, wasActivated), _.difference(wasActivated, activatedNodes));
		},
		horizontalSelectionThreshold = 300,
		isAddLinkMode,
		applyLabels = function (newLayout) {
			if (!currentLabelGenerator) {
				return;
			}
			var labelMap = currentLabelGenerator(idea);
			_.each(newLayout.nodes, function (node, id) {
				if (labelMap[id] || labelMap[id] === 0) {
					node.label = labelMap[id];
				}
			});
		},
		updateCurrentLayout = function (newLayout, sessionId) {
			self.dispatchEvent('layoutChangeStarting', _.size(newLayout.nodes) - _.size(currentLayout.nodes));
			applyLabels(newLayout);

			_.each(currentLayout.connectors, function (oldConnector, connectorId) {
				var newConnector = newLayout.connectors[connectorId];
				if (!newConnector || newConnector.from !== oldConnector.from || newConnector.to !== oldConnector.to) {
					self.dispatchEvent('connectorRemoved', oldConnector);
				}
			});
			_.each(currentLayout.links, function (oldLink, linkId) {
				var newLink = newLayout.links && newLayout.links[linkId];
				if (!newLink) {
					self.dispatchEvent('linkRemoved', oldLink);
				}
			});
			_.each(currentLayout.nodes, function (oldNode, nodeId) {
				var newNode = newLayout.nodes[nodeId],
					newActive;
				if (!newNode) {
					/*jslint eqeq: true*/
					if (nodeId == currentlySelectedIdeaId) {
						self.selectNode(idea.id);
					}
					newActive = _.reject(activatedNodes, function (e) {
						return e == nodeId;
					});
					if (newActive.length !== activatedNodes.length) {
						setActiveNodes(newActive);
					}
					self.dispatchEvent('nodeRemoved', oldNode, nodeId, sessionId);
				}
			});

			_.each(newLayout.nodes, function (newNode, nodeId) {
				var oldNode = currentLayout.nodes[nodeId];
				if (!oldNode) {
					self.dispatchEvent('nodeCreated', newNode, sessionId);
				} else {
					if (newNode.x !== oldNode.x || newNode.y !== oldNode.y) {
						self.dispatchEvent('nodeMoved', newNode, sessionId);
					}
					if (newNode.title !== oldNode.title) {
						self.dispatchEvent('nodeTitleChanged', newNode, sessionId);
					}
					if (!_.isEqual(newNode.attr || {}, oldNode.attr || {})) {
						self.dispatchEvent('nodeAttrChanged', newNode, sessionId);
					}
					if (newNode.label !== oldNode.label) {
						self.dispatchEvent('nodeLabelChanged', newNode, sessionId);
					}
				}
			});
			_.each(newLayout.connectors, function (newConnector, connectorId) {
				var oldConnector = currentLayout.connectors[connectorId];
				if (!oldConnector || newConnector.from !== oldConnector.from || newConnector.to !== oldConnector.to) {
					self.dispatchEvent('connectorCreated', newConnector, sessionId);
				}
			});
			_.each(newLayout.links, function (newLink, linkId) {
				var oldLink = currentLayout.links && currentLayout.links[linkId];
				if (oldLink) {
					if (!_.isEqual(newLink.attr || {}, (oldLink && oldLink.attr) || {})) {
						self.dispatchEvent('linkAttrChanged', newLink, sessionId);
					}
				} else {
					self.dispatchEvent('linkCreated', newLink, sessionId);
				}
			});
			currentLayout = newLayout;
			if (!self.isInCollapse) {
				self.dispatchEvent('layoutChangeComplete');
			}
		},
		revertSelectionForUndo,
		revertActivatedForUndo,
		selectNewIdea = function (newIdeaId) {
			revertSelectionForUndo = currentlySelectedIdeaId;
			revertActivatedForUndo = activatedNodes.slice(0);
			self.selectNode(newIdeaId);
		},
		editNewIdea = function (newIdeaId) {
			selectNewIdea(newIdeaId);
			self.editNode(false, true, true);
		},
		getCurrentlySelectedIdeaId = function () {
			return currentlySelectedIdeaId || idea.id;
		},
		paused = false,
		onIdeaChanged = function (action, args, sessionId) {
			if (paused) {
				return;
			}
			revertSelectionForUndo = false;
			revertActivatedForUndo = false;
			self.rebuildRequired(sessionId);
		},
		currentlySelectedIdea = function () {
			return (idea.findSubIdeaById(currentlySelectedIdeaId) || idea);
		},
		ensureNodeIsExpanded = function (source, nodeId) {
			var node = idea.findSubIdeaById(nodeId) || idea;
			if (node.getAttr('collapsed')) {
				idea.updateAttr(nodeId, 'collapsed', false);
			}
		};
	observable(this);
	analytic = self.dispatchEvent.bind(self, 'analytic', 'mapModel');
	self.pause = function () {
		paused = true;
	};
	self.resume = function () {
		paused = false;
		self.rebuildRequired();
	};
	self.getIdea = function () {
		return idea;
	};
	self.isEditingEnabled = function () {
		return isEditingEnabled;
	};
	self.getCurrentLayout = function () {
		return currentLayout;
	};
	self.analytic = analytic;
	self.getCurrentlySelectedIdeaId = getCurrentlySelectedIdeaId;
	self.rebuildRequired = function (sessionId) {
		if (!idea) {
			return;
		}
		updateCurrentLayout(self.reactivate(layoutCalculator(idea)), sessionId);
	};
	this.setIdea = function (anIdea) {
		if (idea) {
			idea.removeEventListener('changed', onIdeaChanged);
			paused = false;
			setActiveNodes([]);
			self.dispatchEvent('nodeSelectionChanged', currentlySelectedIdeaId, false);
			currentlySelectedIdeaId = undefined;
		}
		idea = anIdea;
		idea.addEventListener('changed', onIdeaChanged);
		onIdeaChanged();
		self.selectNode(idea.id, true);
		self.dispatchEvent('mapViewResetRequested');
	};
	this.setEditingEnabled = function (value) {
		isEditingEnabled = value;
	};
	this.getEditingEnabled = function () {
		return isEditingEnabled;
	};
	this.setInputEnabled = function (value, holdFocus) {
		if (isInputEnabled !== value) {
			isInputEnabled = value;
			self.dispatchEvent('inputEnabledChanged', value, !!holdFocus);
		}
	};
	this.getInputEnabled = function () {
		return isInputEnabled;
	};
	this.selectNode = function (id, force, appendToActive) {
		if (force || (isInputEnabled && (id !== currentlySelectedIdeaId || !self.isActivated(id)))) {
			if (currentlySelectedIdeaId) {
				self.dispatchEvent('nodeSelectionChanged', currentlySelectedIdeaId, false);
			}
			currentlySelectedIdeaId = id;
			if (appendToActive) {
				self.activateNode('internal', id);
			} else {
				setActiveNodes([id]);
			}

			self.dispatchEvent('nodeSelectionChanged', id, true);
		}
	};
	this.clickNode = function (id, event) {
		var button = event && event.button && event.button !== -1;
		if (event && event.altKey) {
			self.addLink('mouse', id);
		} else if (event && event.shiftKey) {
			/*don't stop propagation, this is needed for drop targets*/
			self.toggleActivationOnNode('mouse', id);
		} else if (isAddLinkMode && !button) {
			this.addLink('mouse', id);
			this.toggleAddLinkMode();
		} else {
			this.selectNode(id);
			if (button && button !== -1 && isInputEnabled) {
				self.dispatchEvent('contextMenuRequested', id, event.layerX, event.layerY);
			}
		}
	};
	this.findIdeaById = function (id) {
		/*jslint eqeq:true */
		if (idea.id == id) {
			return idea;
		}
		return idea.findSubIdeaById(id);
	};
	this.getSelectedStyle = function (prop) {
		return this.getStyleForId(currentlySelectedIdeaId, prop);
	};
	this.getStyleForId = function (id, prop) {
		var node = currentLayout.nodes && currentLayout.nodes[id];
		return node && node.attr && node.attr.style && node.attr.style[prop];
	};
	this.toggleCollapse = function (source) {
		var selectedIdea = currentlySelectedIdea(),
			isCollapsed;
		if (self.isActivated(selectedIdea.id) && _.size(selectedIdea.ideas) > 0) {
			isCollapsed = selectedIdea.getAttr('collapsed');
		} else {
			isCollapsed = self.everyActivatedIs(function (id) {
				var node = self.findIdeaById(id);
				if (node && _.size(node.ideas) > 0) {
					return node.getAttr('collapsed');
				}
				return true;
			});
		}
		this.collapse(source, !isCollapsed);
	};
	this.collapse = function (source, doCollapse) {
		analytic('collapse:' + doCollapse, source);
		self.isInCollapse = true;
		var contextNodeId = getCurrentlySelectedIdeaId(),
			contextNode = function () {
				return contextNodeId && currentLayout && currentLayout.nodes && currentLayout.nodes[contextNodeId];
			},
			moveNodes = function (nodes, deltaX, deltaY) {
				if (deltaX || deltaY) {
					_.each(nodes, function (node) {
						node.x += deltaX;
						node.y += deltaY;
						self.dispatchEvent('nodeMoved', node, 'scroll');
					});
				}
			},
			oldContext,
			newContext;
		oldContext = contextNode();
		if (isInputEnabled) {
			self.applyToActivated(function (id) {
				var node = self.findIdeaById(id);
				if (node && (!doCollapse || (node.ideas && _.size(node.ideas) > 0))) {
					idea.updateAttr(id, 'collapsed', doCollapse);
				}
			});
		}
		newContext = contextNode();
		if (oldContext && newContext) {
			moveNodes(
				currentLayout.nodes,
				oldContext.x - newContext.x,
				oldContext.y - newContext.y
			);
		}
		self.isInCollapse = false;
		self.dispatchEvent('layoutChangeComplete');
	};
	this.updateStyle = function (source, prop, value) {
		/*jslint eqeq:true */
		if (!isEditingEnabled) {
			return false;
		}
		if (isInputEnabled) {
			analytic('updateStyle:' + prop, source);
			self.applyToActivated(function (id) {
				if (self.getStyleForId(id, prop) != value) {
					idea.mergeAttrProperty(id, 'style', prop, value);
				}
			});
		}
	};
	this.updateLinkStyle = function (source, ideaIdFrom, ideaIdTo, prop, value) {
		if (!isEditingEnabled) {
			return false;
		}
		if (isInputEnabled) {
			analytic('updateLinkStyle:' + prop, source);
			var merged = _.extend({}, idea.getLinkAttr(ideaIdFrom, ideaIdTo, 'style'));
			merged[prop] = value;
			idea.updateLinkAttr(ideaIdFrom, ideaIdTo, 'style', merged);
		}
	};
	this.addSubIdea = function (source, parentId, initialTitle) {
		if (!isEditingEnabled) {
			return false;
		}
		var target = parentId || currentlySelectedIdeaId, newId;
		analytic('addSubIdea', source);
		if (isInputEnabled) {
			idea.batch(function () {
				ensureNodeIsExpanded(source, target);
				if (initialTitle) {
					newId = idea.addSubIdea(target, initialTitle);
				} else {
					newId = idea.addSubIdea(target);
				}
			});
			if (newId) {
				if (initialTitle) {
					selectNewIdea(newId);
				} else {
					editNewIdea(newId);
				}
			}
		}

	};
	this.insertIntermediate = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (!isInputEnabled || currentlySelectedIdeaId === idea.id) {
			return false;
		}
		var activeNodes = [], newId;
		analytic('insertIntermediate', source);
		self.applyToActivated(function (i) {
			activeNodes.push(i);
		});
		newId = idea.insertIntermediateMultiple(activeNodes);
		if (newId) {
			editNewIdea(newId);
		}
	};
	this.flip = function (source) {

		if (!isEditingEnabled) {
			return false;
		}
		analytic('flip', source);
		if (!isInputEnabled || currentlySelectedIdeaId === idea.id) {
			return false;
		}
		var node = currentLayout.nodes[currentlySelectedIdeaId];
		if (!node || node.level !== 2) {
			return false;
		}

		return idea.flip(currentlySelectedIdeaId);
	};
	this.addSiblingIdeaBefore = function (source) {
		var newId, parent, contextRank, newRank;
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addSiblingIdeaBefore', source);
		if (!isInputEnabled) {
			return false;
		}
		parent = idea.findParent(currentlySelectedIdeaId) || idea;
		idea.batch(function () {
			ensureNodeIsExpanded(source, parent.id);
			newId = idea.addSubIdea(parent.id);
			if (newId && currentlySelectedIdeaId !== idea.id) {
				contextRank = parent.findChildRankById(currentlySelectedIdeaId);
				newRank = parent.findChildRankById(newId);
				if (contextRank * newRank < 0) {
					idea.flip(newId);
				}
				idea.positionBefore(newId, currentlySelectedIdeaId);
			}
		});
		if (newId) {
			editNewIdea(newId);
		}
	};
	this.addSiblingIdea = function (source, optionalNodeId, optionalInitialText) {
		var newId, nextId, parent, contextRank, newRank, currentId;
		currentId = optionalNodeId || currentlySelectedIdeaId;
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addSiblingIdea', source);
		if (isInputEnabled) {
			parent = idea.findParent(currentId) || idea;
			idea.batch(function () {
				ensureNodeIsExpanded(source, parent.id);
				if (optionalInitialText) {
					newId = idea.addSubIdea(parent.id, optionalInitialText);
				} else {
					newId = idea.addSubIdea(parent.id);
				}
				if (newId && currentId !== idea.id) {
					nextId = idea.nextSiblingId(currentId);
					contextRank = parent.findChildRankById(currentId);
					newRank = parent.findChildRankById(newId);
					if (contextRank * newRank < 0) {
						idea.flip(newId);
					}
					if (nextId) {
						idea.positionBefore(newId, nextId);
					}
				}
			});
			if (newId) {
				if (optionalInitialText) {
					selectNewIdea(newId);
				} else {
					editNewIdea(newId);
				}
			}
		}
	};
	this.removeSubIdea = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('removeSubIdea', source);
		var removed;
		if (isInputEnabled) {
			self.applyToActivated(function (id) {
				/*jslint eqeq:true */
				var parent;
				if (currentlySelectedIdeaId == id) {
					parent = idea.findParent(currentlySelectedIdeaId);
					if (parent) {
						self.selectNode(parent.id);
					}
				}
				removed  = idea.removeSubIdea(id);
			});
		}
		return removed;
	};
	this.updateTitle = function (ideaId, title, isNew) {
		if (isNew) {
			idea.initialiseTitle(ideaId, title);
		} else {
			idea.updateTitle(ideaId, title);
		}
	};
	this.editNode = function (source, shouldSelectAll, editingNew) {
		if (!isEditingEnabled) {
			return false;
		}
		if (source) {
			analytic('editNode', source);
		}
		if (!isInputEnabled) {
			return false;
		}
		var title = currentlySelectedIdea().title;
		if (_.include(selectAllTitles, title)) { // === 'Press Space or double-click to edit') {
			shouldSelectAll = true;
		}
		self.dispatchEvent('nodeEditRequested', currentlySelectedIdeaId, shouldSelectAll, !!editingNew);
	};
	this.editIcon = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (source) {
			analytic('editIcon', source);
		}
		if (!isInputEnabled) {
			return false;
		}
		self.dispatchEvent('nodeIconEditRequested', currentlySelectedIdeaId);
	};
	this.scaleUp = function (source) {
		self.scale(source, 1.25);
	};
	this.scaleDown = function (source) {
		self.scale(source, 0.8);
	};
	this.scale = function (source, scaleMultiplier, zoomPoint) {
		if (isInputEnabled) {
			self.dispatchEvent('mapScaleChanged', scaleMultiplier, zoomPoint);
			analytic(scaleMultiplier < 1 ? 'scaleDown' : 'scaleUp', source);
		}
	};
	this.move = function (source, deltaX, deltaY) {
		if (isInputEnabled) {
			self.dispatchEvent('mapMoveRequested', deltaX, deltaY);
			analytic('move', source);
		}
	};
	this.resetView = function (source) {
		if (isInputEnabled) {
			self.selectNode(idea.id);
			self.dispatchEvent('mapViewResetRequested');
			analytic('resetView', source);
		}

	};
	this.openAttachment = function (source, nodeId) {
		analytic('openAttachment', source);
		nodeId = nodeId || currentlySelectedIdeaId;
		var node = currentLayout.nodes[nodeId],
			attachment = node && node.attr && node.attr.attachment;
		if (node) {
			self.dispatchEvent('attachmentOpened', nodeId, attachment);
		}
	};
	this.setAttachment = function (source, nodeId, attachment) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('setAttachment', source);
		var hasAttachment = !!(attachment && attachment.content);
		idea.updateAttr(nodeId, 'attachment', hasAttachment && attachment);
	};
	this.addLink = function (source, nodeIdTo) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('addLink', source);
		idea.addLink(currentlySelectedIdeaId, nodeIdTo);
	};
	this.selectLink = function (source, link, selectionPoint) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('selectLink', source);
		if (!link) {
			return false;
		}
		self.dispatchEvent('linkSelected', link, selectionPoint, idea.getLinkAttr(link.ideaIdFrom, link.ideaIdTo, 'style'));
	};
	this.removeLink = function (source, nodeIdFrom, nodeIdTo) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('removeLink', source);
		idea.removeLink(nodeIdFrom, nodeIdTo);
	};

	this.toggleAddLinkMode = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		if (!isInputEnabled) {
			return false;
		}
		analytic('toggleAddLinkMode', source);
		isAddLinkMode = !isAddLinkMode;
		self.dispatchEvent('addLinkModeToggled', isAddLinkMode);
	};
	this.cancelCurrentAction = function (source) {
		if (!isInputEnabled) {
			return false;
		}
		if (!isEditingEnabled) {
			return false;
		}
		if (isAddLinkMode) {
			this.toggleAddLinkMode(source);
		}
	};
	self.undo = function (source) {
		if (!isEditingEnabled) {
			return false;
		}

		analytic('undo', source);
		var undoSelectionClone = revertSelectionForUndo,
			undoActivationClone = revertActivatedForUndo;
		if (isInputEnabled) {
			idea.undo();
			if (undoSelectionClone) {
				self.selectNode(undoSelectionClone);
			}
			if (undoActivationClone) {
				setActiveNodes(undoActivationClone);
			}

		}
	};
	self.redo = function (source) {
		if (!isEditingEnabled) {
			return false;
		}

		analytic('redo', source);
		if (isInputEnabled) {
			idea.redo();
		}
	};
	self.moveRelative = function (source, relativeMovement) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('moveRelative', source);
		if (isInputEnabled) {
			idea.moveRelative(currentlySelectedIdeaId, relativeMovement);
		}
	};
	self.cut = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('cut', source);
		if (isInputEnabled) {
			var activeNodeIds = [], parents = [], firstLiveParent;
			self.applyToActivated(function (nodeId) {
				activeNodeIds.push(nodeId);
				parents.push(idea.findParent(nodeId).id);
			});
			clipboard.put(idea.cloneMultiple(activeNodeIds));
			idea.removeMultiple(activeNodeIds);
			firstLiveParent = _.find(parents, idea.findSubIdeaById);
			self.selectNode(firstLiveParent || idea.id);
		}
	};
	self.contextForNode = function (nodeId) {
		var node = self.findIdeaById(nodeId),
				hasChildren = node && node.ideas && _.size(node.ideas) > 0,
				hasSiblings = idea.hasSiblings(nodeId),
				canPaste = node && isEditingEnabled && clipboard && clipboard.get();
		if (node) {
			return {'hasChildren': !!hasChildren, 'hasSiblings': !!hasSiblings, 'canPaste': !!canPaste};
		}

	};
	self.copy = function (source) {
		var activeNodeIds = [];
		if (!isEditingEnabled) {
			return false;
		}
		analytic('copy', source);
		if (isInputEnabled) {
			self.applyToActivated(function (node) {
				activeNodeIds.push(node);
			});
			clipboard.put(idea.cloneMultiple(activeNodeIds));
		}
	};
	self.paste = function (source) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('paste', source);
		if (isInputEnabled) {
			var result = idea.pasteMultiple(currentlySelectedIdeaId, clipboard.get());
			if (result && result[0]) {
				self.selectNode(result[0]);
			}
		}
	};
	self.pasteStyle = function (source) {
		var clipContents = clipboard.get(),
			pastingStyle;
		if (!isEditingEnabled) {
			return false;
		}
		analytic('pasteStyle', source);
		if (isInputEnabled && clipContents && clipContents[0]) {
			pastingStyle = clipContents[0].attr && clipContents[0].attr.style;
			self.applyToActivated(function (id) {
				idea.updateAttr(id, 'style', pastingStyle);
			});
		}
	};
	self.getIcon = function (nodeId) {
		var node = currentLayout.nodes[nodeId || currentlySelectedIdeaId];
		if (!node) {
			return false;
		}
		return node.attr && node.attr.icon;
	};
	self.setIcon = function (source, url, imgWidth, imgHeight, position, nodeId) {
		if (!isEditingEnabled) {
			return false;
		}
		analytic('setIcon', source);
		nodeId = nodeId || currentlySelectedIdeaId;
		var nodeIdea = self.findIdeaById(nodeId);
		if (!nodeIdea) {
			return false;
		}
		if (url) {
			idea.updateAttr(nodeId, 'icon', {
				url: url,
				width: imgWidth,
				height: imgHeight,
				position: position
			});
		} else if (nodeIdea.title || nodeId === idea.id) {
			idea.updateAttr(nodeId, 'icon', false);
		} else {
			idea.removeSubIdea(nodeId);
		}
	};
	self.moveUp = function (source) {
		self.moveRelative(source, -1);
	};
	self.moveDown = function (source) {
		self.moveRelative(source, 1);
	};
	self.getSelectedNodeId = function () {
		return getCurrentlySelectedIdeaId();
	};
	self.centerOnNode = function (nodeId) {
		if (!currentLayout.nodes[nodeId]) {
			idea.startBatch();
			_.each(idea.calculatePath(nodeId), function (parent) {
				idea.updateAttr(parent.id, 'collapsed', false);
			});
			idea.endBatch();
		}
		self.dispatchEvent('nodeFocusRequested', nodeId);
		self.selectNode(nodeId);
	};
	self.search = function (query) {
		var result = [];
		query = query.toLocaleLowerCase();
		idea.traverse(function (contentIdea) {
			if (contentIdea.title && contentIdea.title.toLocaleLowerCase().indexOf(query) >= 0) {
				result.push({id: contentIdea.id, title: contentIdea.title});
			}
		});
		return result;
	};
	//node activation and selection
	(function () {
			var isRootOrRightHalf = function (id) {
				return currentLayout.nodes[id].x >= currentLayout.nodes[idea.id].x;
			},
			isRootOrLeftHalf = function (id) {
				return currentLayout.nodes[id].x <= currentLayout.nodes[idea.id].x;
			},
			nodesWithIDs = function () {
				return _.map(currentLayout.nodes,
					function (n, nodeId) {
						return _.extend({ id: parseInt(nodeId, 10)}, n);
					});
			},
			applyToNodeLeft = function (source, analyticTag, method) {
				var node,
					rank,
					isRoot = currentlySelectedIdeaId === idea.id,
					targetRank = isRoot ? -Infinity : Infinity;
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (isRootOrLeftHalf(currentlySelectedIdeaId)) {
					node = idea.id === currentlySelectedIdeaId ? idea : idea.findSubIdeaById(currentlySelectedIdeaId);
					ensureNodeIsExpanded(source, node.id);
					for (rank in node.ideas) {
						rank = parseFloat(rank);
						if ((isRoot && rank < 0 && rank > targetRank) || (!isRoot && rank > 0 && rank < targetRank)) {
							targetRank = rank;
						}
					}
					if (targetRank !== Infinity && targetRank !== -Infinity) {
						method.apply(self, [node.ideas[targetRank].id]);
					}
				} else {
					method.apply(self, [idea.findParent(currentlySelectedIdeaId).id]);
				}
			},
			applyToNodeRight = function (source, analyticTag, method) {
				var node, rank, minimumPositiveRank = Infinity;
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (isRootOrRightHalf(currentlySelectedIdeaId)) {
					node = idea.id === currentlySelectedIdeaId ? idea : idea.findSubIdeaById(currentlySelectedIdeaId);
					ensureNodeIsExpanded(source, node.id);
					for (rank in node.ideas) {
						rank = parseFloat(rank);
						if (rank > 0 && rank < minimumPositiveRank) {
							minimumPositiveRank = rank;
						}
					}
					if (minimumPositiveRank !== Infinity) {
						method.apply(self, [node.ideas[minimumPositiveRank].id]);
					}
				} else {
					method.apply(self, [idea.findParent(currentlySelectedIdeaId).id]);
				}
			},
			applyToNodeUp = function (source, analyticTag, method) {
				var previousSibling = idea.previousSiblingId(currentlySelectedIdeaId),
					nodesAbove,
					closestNode,
					currentNode = currentLayout.nodes[currentlySelectedIdeaId];
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (previousSibling) {
					method.apply(self, [previousSibling]);
				} else {
					if (!currentNode) {
						return;
					}
					nodesAbove = _.reject(nodesWithIDs(), function (node) {
						return node.y >= currentNode.y || Math.abs(node.x - currentNode.x) > horizontalSelectionThreshold;
					});
					if (_.size(nodesAbove) === 0) {
						return;
					}
					closestNode = _.min(nodesAbove, function (node) {
						return Math.pow(node.x - currentNode.x, 2) + Math.pow(node.y - currentNode.y, 2);
					});
					method.apply(self, [closestNode.id]);
				}
			},
			applyToNodeDown = function (source, analyticTag, method) {
				var nextSibling = idea.nextSiblingId(currentlySelectedIdeaId),
					nodesBelow,
					closestNode,
					currentNode = currentLayout.nodes[currentlySelectedIdeaId];
				if (!isInputEnabled) {
					return;
				}
				analytic(analyticTag, source);
				if (nextSibling) {
					method.apply(self, [nextSibling]);
				} else {
					if (!currentNode) {
						return;
					}
					nodesBelow = _.reject(nodesWithIDs(), function (node) {
						return node.y <= currentNode.y || Math.abs(node.x - currentNode.x) > horizontalSelectionThreshold;
					});
					if (_.size(nodesBelow) === 0) {
						return;
					}
					closestNode = _.min(nodesBelow, function (node) {
						return Math.pow(node.x - currentNode.x, 2) + Math.pow(node.y - currentNode.y, 2);
					});
					method.apply(self, [closestNode.id]);
				}
			},
			applyFuncs = { 'Left': applyToNodeLeft, 'Up': applyToNodeUp, 'Down': applyToNodeDown, 'Right': applyToNodeRight };
			self.getActivatedNodeIds = function () {
				return activatedNodes.slice(0);
			};
			self.activateSiblingNodes = function (source) {
				var parent = idea.findParent(currentlySelectedIdeaId),
					siblingIds;
				analytic('activateSiblingNodes', source);
				if (!parent || !parent.ideas) {
					return;
				}
				siblingIds = _.map(parent.ideas, function (child) {
					return child.id;
				});
				setActiveNodes(siblingIds);
			};
			self.activateNodeAndChildren = function (source) {
				analytic('activateNodeAndChildren', source);
				var contextId = getCurrentlySelectedIdeaId(),
					subtree = idea.getSubTreeIds(contextId);
				subtree.push(contextId);
				setActiveNodes(subtree);
			};
			_.each(['Left', 'Right', 'Up', 'Down'], function (position) {
				self['activateNode' + position] = function (source) {
					applyFuncs[position](source, 'activateNode' + position, function (nodeId) {
						self.selectNode(nodeId, false, true);
					});
				};
				self['selectNode' + position] = function (source) {
					applyFuncs[position](source, 'selectNode' + position, self.selectNode);
				};
			});
			self.toggleActivationOnNode = function (source, nodeId) {
				analytic('toggleActivated', source);
				if (!self.isActivated(nodeId)) {
					setActiveNodes([nodeId].concat(activatedNodes));
				} else {
					setActiveNodes(_.without(activatedNodes, nodeId));
				}
			};
			self.activateNode = function (source, nodeId) {
				analytic('activateNode', source);
				if (!self.isActivated(nodeId)) {
					activatedNodes.push(nodeId);
					self.dispatchEvent('activatedNodesChanged', [nodeId], []);
				}
			};
			self.activateChildren = function (source) {
				analytic('activateChildren', source);
				var context = currentlySelectedIdea();
				if (!context || _.isEmpty(context.ideas) || context.getAttr('collapsed')) {
					return;
				}
				setActiveNodes(idea.getSubTreeIds(context.id));
			};
			self.activateSelectedNode = function (source) {
				analytic('activateSelectedNode', source);
				setActiveNodes([getCurrentlySelectedIdeaId()]);
			};
			self.isActivated = function (id) {
				/*jslint eqeq:true*/
				return _.find(activatedNodes, function (activeId) {
					return id == activeId;
				});
			};
			self.applyToActivated = function (toApply) {
				idea.batch(function () {
					_.each(activatedNodes, toApply);
				});
			};
			self.everyActivatedIs = function (predicate) {
				return _.every(activatedNodes, predicate);
			};
			self.activateLevel = function (source, level) {
				analytic('activateLevel', source);
				var toActivate = _.map(
					_.filter(
						currentLayout.nodes,
						function (node) {
							/*jslint eqeq:true*/
							return node.level == level;
						}
					),
					function (node) {
						return node.id;
					}
				);
				if (!_.isEmpty(toActivate)) {
					setActiveNodes(toActivate);
				}
			};
			self.reactivate = function (layout) {
				_.each(layout.nodes, function (node) {
					if (_.contains(activatedNodes, node.id)) {
						node.activated = true;
					}
				});
				return layout;
			};
		}());

	self.getNodeIdAtPosition = function (x, y) {
		var isPointOverNode = function (node) { //move to mapModel candidate
				/*jslint eqeq: true*/
				return x >= node.x &&
					y >= node.y &&
					x <= node.x + node.width &&
					y <= node.y + node.height;
			},
			node = _.find(currentLayout.nodes, isPointOverNode);
		return node && node.id;
	};
	self.autoPosition = function (nodeId) {
		return idea.updateAttr(nodeId, 'position', false);
	};
	self.positionNodeAt = function (nodeId, x, y, manualPosition) {
		var rootNode = currentLayout.nodes[idea.id],
			verticallyClosestNode = {
				id: null,
				y: Infinity
			},
			parentIdea = idea.findParent(nodeId),
			parentNode = currentLayout.nodes[parentIdea.id],
			nodeBeingDragged = currentLayout.nodes[nodeId],
			tryFlip = function (rootNode, nodeBeingDragged, nodeDragEndX) {
				var flipRightToLeft = rootNode.x < nodeBeingDragged.x && nodeDragEndX < rootNode.x,
					flipLeftToRight = rootNode.x > nodeBeingDragged.x && rootNode.x < nodeDragEndX;
				if (flipRightToLeft || flipLeftToRight) {
					return idea.flip(nodeId);
				}
				return false;
			},
			maxSequence = 1,
			validReposition = function () {
				return nodeBeingDragged.level === 2 ||
					((nodeBeingDragged.x - parentNode.x) * (x - parentNode.x) > 0);
			},
			result = false,
			xOffset;
		idea.startBatch();
		if (currentLayout.nodes[nodeId].level === 2) {
			result = tryFlip(rootNode, nodeBeingDragged, x);
		}
		_.each(idea.sameSideSiblingIds(nodeId), function (id) {
			var node = currentLayout.nodes[id];
			if (y < node.y && node.y < verticallyClosestNode.y) {
				verticallyClosestNode = node;
			}
		});
		if (!manualPosition && validReposition()) {
			self.autoPosition(nodeId);
		}
		result = idea.positionBefore(nodeId, verticallyClosestNode.id) || result;
		if (manualPosition && validReposition()) {
			if (x < parentNode.x) {
				xOffset = parentNode.x - x - nodeBeingDragged.width + parentNode.width; /* negative nodes will get flipped so distance is not correct out of the box */
			} else {
				xOffset = x - parentNode.x;
			}
			analytic('nodeManuallyPositioned');
			maxSequence = _.max(_.map(parentIdea.ideas, function (i) {
				return (i.id !== nodeId && i.attr && i.attr.position && i.attr.position[2]) || 0;
			}));
			result = idea.updateAttr(
				nodeId,
				'position',
				[xOffset, y - parentNode.y, maxSequence + 1]
			) || result;
		}
		idea.endBatch();
		return result;
	};
	self.dropNode = function (nodeId, dropTargetId, shiftKey) {
		var clone,
			parentIdea = idea.findParent(nodeId);
		if (dropTargetId === nodeId) {
			return false;
		}
		if (shiftKey) {
			clone = idea.clone(nodeId);
			if (clone) {
				idea.paste(dropTargetId, clone);
			}
			return false;
		}
		if (dropTargetId === parentIdea.id) {
			return self.autoPosition(nodeId);
		} else {
			return idea.changeParent(nodeId, dropTargetId);
		}
	};
	self.setLayoutCalculator = function (newCalculator) {
		layoutCalculator = newCalculator;
	};
	self.dropImage =  function (dataUrl, imgWidth, imgHeight, x, y) {
		var nodeId,
			dropOn = function (ideaId, position) {
				var scaleX = Math.min(imgWidth, 300) / imgWidth,
					scaleY = Math.min(imgHeight, 300) / imgHeight,
					scale = Math.min(scaleX, scaleY),
					existing = idea.getAttrById(ideaId, 'icon');
				self.setIcon('drag and drop', dataUrl, Math.round(imgWidth * scale), Math.round(imgHeight * scale), (existing && existing.position) || position, ideaId);
			},
			addNew = function () {
				var newId;
				idea.startBatch();
				newId = idea.addSubIdea(currentlySelectedIdeaId);
				dropOn(newId, 'center');
				idea.endBatch();
				self.selectNode(newId);
			};
		nodeId = self.getNodeIdAtPosition(x, y);
		if (nodeId) {
			return dropOn(nodeId, 'left');
		}
		addNew();
	};
	self.setLabelGenerator = function (labelGenerator) {
		currentLabelGenerator = labelGenerator;
		self.rebuildRequired();
	};
	self.getReorderBoundary = function (nodeId) {
		var isRoot = function () {
				/*jslint eqeq: true*/
				return nodeId == idea.id;
			},
			isFirstLevel = function () {
				return parentIdea.id === idea.id;
			},
			isRightHalf = function (nodeId) {
				return currentLayout.nodes[nodeId].x >= currentLayout.nodes[idea.id].x;
			},
			siblingBoundary = function (siblings, side) {
				var tops = _.map(siblings, function (node) {
					return node.y;
				}),
				bottoms = _.map(siblings, function (node) {
					return node.y + node.height;
				}),
				result = {
					'minY': _.min(tops) -  reorderMargin - currentLayout.nodes[nodeId].height,
					'maxY': _.max(bottoms) +  reorderMargin,
					'margin': reorderMargin
				};
				result.edge = side;
				if (side === 'left') {
					result.x = parentNode.x + parentNode.width + reorderMargin;
				} else {
					result.x = parentNode.x - reorderMargin;
				}
				return result;
			},
			parentBoundary = function (side) {
				var result = {
					'minY': parentNode.y -  reorderMargin - currentLayout.nodes[nodeId].height,
					'maxY': parentNode.y + parentNode.height +  reorderMargin,
					'margin': reorderMargin
				};
				result.edge = side;
				if (side === 'left') {
					result.x = parentNode.x + parentNode.width + reorderMargin;
				} else {
					result.x = parentNode.x - reorderMargin;
				}

				return result;
			},
			otherSideSiblings = function () {
				var otherSide = _.map(parentIdea.ideas, function (subIdea) {
					return currentLayout.nodes[subIdea.id];
				});
				otherSide = _.without(otherSide, currentLayout.nodes[nodeId]);
				if (!_.isEmpty(sameSide)) {
					otherSide = _.difference(otherSide, sameSide);
				}
				return otherSide;
			},
			parentIdea,
			parentNode,
			boundaries = [],
			sameSide,
			opposite,
			primaryEdge,
			secondaryEdge;
		if (isRoot(nodeId)) {
			return false;
		}
		parentIdea = idea.findParent(nodeId);
		parentNode = currentLayout.nodes[parentIdea.id];
		primaryEdge = isRightHalf(nodeId) ? 'left' : 'right';
		secondaryEdge = isRightHalf(nodeId) ? 'right' : 'left';
		sameSide = _.map(idea.sameSideSiblingIds(nodeId), function (id) {
			return currentLayout.nodes[id];
		});
		if (!_.isEmpty(sameSide)) {
			boundaries.push(siblingBoundary(sameSide, primaryEdge));
		}
		boundaries.push(parentBoundary(primaryEdge));
		if (isFirstLevel()) {
			opposite = otherSideSiblings();
			if (!_.isEmpty(opposite)) {
				boundaries.push(siblingBoundary(opposite, secondaryEdge));
			}
			boundaries.push(parentBoundary(secondaryEdge));
		}
		return boundaries;
	};
	self.focusAndSelect = function (nodeId) {
		self.selectNode(nodeId);
		self.dispatchEvent('nodeFocusRequested', nodeId);
	};
	self.requestContextMenu = function (eventPointX, eventPointY) {
		if (isInputEnabled && isEditingEnabled) {
			self.dispatchEvent('contextMenuRequested', currentlySelectedIdeaId, eventPointX, eventPointY);
			return true;
		}
		return false;
	};
};
/*global jQuery*/
jQuery.fn.mapToolbarWidget = function (mapModel) {
	'use strict';
	var clickMethodNames = ['insertIntermediate', 'scaleUp', 'scaleDown', 'addSubIdea', 'editNode', 'removeSubIdea', 'toggleCollapse', 'addSiblingIdea', 'undo', 'redo',
			'copy', 'cut', 'paste', 'resetView', 'openAttachment', 'toggleAddLinkMode', 'activateChildren', 'activateNodeAndChildren', 'activateSiblingNodes', 'editIcon'],
		changeMethodNames = ['updateStyle'];
	return this.each(function () {
		var element = jQuery(this), preventRoundtrip = false;
		mapModel.addEventListener('nodeSelectionChanged', function () {
			preventRoundtrip = true;
			element.find('.updateStyle[data-mm-target-property]').val(function () {
				return mapModel.getSelectedStyle(jQuery(this).data('mm-target-property'));
			}).change();
			preventRoundtrip = false;
		});
		mapModel.addEventListener('addLinkModeToggled', function () {
			element.find('.toggleAddLinkMode').toggleClass('active');
		});
		clickMethodNames.forEach(function (methodName) {
			element.find('.' + methodName).click(function () {
				if (mapModel[methodName]) {
					mapModel[methodName]('toolbar');
				}
			});
		});
		changeMethodNames.forEach(function (methodName) {
			element.find('.' + methodName).change(function () {
				if (preventRoundtrip) {
					return;
				}
				var tool = jQuery(this);
				if (tool.data('mm-target-property')) {
					mapModel[methodName]('toolbar', tool.data('mm-target-property'), tool.val());
				}
			});
		});
	});
};
/*global jQuery*/
jQuery.fn.linkEditWidget = function (mapModel) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this), currentLink, width, height, colorElement, lineStyleElement, arrowElement;
		colorElement = element.find('.color');
		lineStyleElement = element.find('.lineStyle');
		arrowElement = element.find('.arrow');
		mapModel.addEventListener('linkSelected', function (link, selectionPoint, linkStyle) {
			currentLink = link;
			element.show();
			width = width || element.width();
			height = height || element.height();
			element.css({
				top: (selectionPoint.y - 0.5 * height - 15) + 'px',
				left: (selectionPoint.x - 0.5 * width - 15) + 'px'
			});
			colorElement.val(linkStyle.color).change();
			lineStyleElement.val(linkStyle.lineStyle);
			arrowElement[linkStyle.arrow ? 'addClass' : 'removeClass']('active');
		});
		mapModel.addEventListener('mapMoveRequested', function () {
			element.hide();
		});
		element.find('.delete').click(function () {
			mapModel.removeLink('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo);
			element.hide();
		});
		colorElement.change(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'color', jQuery(this).val());
		});
		lineStyleElement.find('a').click(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'lineStyle', jQuery(this).text());
		});
		arrowElement.click(function () {
			mapModel.updateLinkStyle('mouse', currentLink.ideaIdFrom, currentLink.ideaIdTo, 'arrow', !arrowElement.hasClass('active'));
		});
		element.mouseleave(element.hide.bind(element));
	});
};
/*global observable, jQuery, FileReader, Image, MAPJS, document, _ */
MAPJS.getDataURIAndDimensions = function (src, corsProxyUrl) {
	'use strict';
	var isDataUri = function (string) {
			return (/^data:image/).test(string);
		},
		convertSrcToDataUri = function (img) {
			if (isDataUri(img.src)) {
				return img.src;
			}
			var canvas = document.createElement('canvas'),
				ctx;
			canvas.width = img.width;
			canvas.height = img.height;
			ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			return canvas.toDataURL('image/png');
		},
		deferred = jQuery.Deferred(),
		domImg = new Image();

	domImg.onload = function () {
		try {
			deferred.resolve({dataUri: convertSrcToDataUri(domImg), width: domImg.width, height: domImg.height});
		} catch (e) {
			deferred.reject();
		}
	};
	domImg.onerror = function () {
		deferred.reject();
	};
	if (!isDataUri(src)) {
		if (corsProxyUrl) {
			domImg.crossOrigin = 'Anonymous';
			src = corsProxyUrl + encodeURIComponent(src);
		} else {
			deferred.reject('no-cors');
		}
	}
	domImg.src = src;
	return deferred.promise();
};
MAPJS.ImageInsertController = function (corsProxyUrl, resourceConverter) {
	'use strict';
	var self = observable(this),
		readFileIntoDataUrl = function (fileInfo) {
			var loader = jQuery.Deferred(),
				fReader = new FileReader();
			fReader.onload = function (e) {
				loader.resolve(e.target.result);
			};
			fReader.onerror = loader.reject;
			fReader.onprogress = loader.notify;
			fReader.readAsDataURL(fileInfo);
			return loader.promise();
		};
	self.insertDataUrl = function (dataUrl, evt) {
		self.dispatchEvent('imageLoadStarted');
		MAPJS.getDataURIAndDimensions(dataUrl, corsProxyUrl).then(
			function (result) {
				var storeUrl = result.dataUri;
				if (resourceConverter) {
					storeUrl = resourceConverter(storeUrl);
				}
				self.dispatchEvent('imageInserted', storeUrl, result.width, result.height, evt);
			},
			function (reason) {
				self.dispatchEvent('imageInsertError', reason);
			}
		);
	};
	self.insertFiles = function (files, evt) {
		jQuery.each(files, function (idx, fileInfo) {
			if (/^image\//.test(fileInfo.type)) {
				jQuery.when(readFileIntoDataUrl(fileInfo)).done(function (dataUrl) {
					self.insertDataUrl(dataUrl, evt);
				});
			}
		});
	};
	self.insertHtmlContent = function (htmlContent, evt) {
		var images = htmlContent.match(/img[^>]*src="([^"]*)"/);
		if (images && images.length > 0) {
			_.each(images.slice(1), function (dataUrl) {
				self.insertDataUrl(dataUrl, evt);
			});
		}
	};
};
jQuery.fn.imageDropWidget = function (imageInsertController) {
	'use strict';
	this.on('dragenter dragover', function (e) {
		if (e.originalEvent.dataTransfer) {
			return false;
		}
	}).on('drop', function (e) {
		var dataTransfer = e.originalEvent.dataTransfer,
			htmlContent;
		e.stopPropagation();
		e.preventDefault();
		if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
			imageInsertController.insertFiles(dataTransfer.files, e.originalEvent);
		} else if (dataTransfer) {
			htmlContent = dataTransfer.getData('text/html');
			imageInsertController.insertHtmlContent(htmlContent, e.originalEvent);
		}
	});
	return this;
};
/*global jQuery, Color, _, MAPJS, document, window*/
MAPJS.DOMRender = {
	svgPixel: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
	nodeCacheMark: function (idea, levelOverride) {
		'use strict';
		return {
			title: idea.title,
			icon: idea.attr && idea.attr.icon && _.pick(idea.attr.icon, 'width', 'height', 'position'),
			collapsed: idea.attr && idea.attr.collapsed,
			level: idea.level || levelOverride
		};
	},
	dummyTextBox: jQuery('<div>').addClass('mapjs-node').css({position: 'absolute', visibility: 'hidden'}),
	dimensionProvider: function (idea, level) {
		'use strict'; /* support multiple stages? */
		var textBox = jQuery(document).nodeWithId(idea.id),
			translateToPixel = function () {
				return MAPJS.DOMRender.svgPixel;
			},
			result;
		if (textBox && textBox.length > 0) {
			if (_.isEqual(textBox.data('nodeCacheMark'), MAPJS.DOMRender.nodeCacheMark(idea, level))) {
				return _.pick(textBox.data(), 'width', 'height');
			}
		}
		textBox = MAPJS.DOMRender.dummyTextBox;
		textBox.attr('mapjs-level', level).appendTo('body').updateNodeContent(idea, translateToPixel);
		result = {
			width: textBox.outerWidth(true),
			height: textBox.outerHeight(true)
		};
		textBox.detach();
		return result;
	},
	layoutCalculator: function (contentAggregate) {
		'use strict';
		return MAPJS.calculateLayout(contentAggregate, MAPJS.DOMRender.dimensionProvider);
	},
	fixedLayout: false
};
MAPJS.createSVG = function (tag) {
	'use strict';
	return jQuery(document.createElementNS('http://www.w3.org/2000/svg', tag || 'svg'));
};
jQuery.fn.getBox = function () {
	'use strict';
	var domShape = this && this[0];
	if (!domShape) {
		return false;
	}
	return {
		top: domShape.offsetTop,
		left: domShape.offsetLeft,
		width: domShape.offsetWidth,
		height: domShape.offsetHeight
	};
};
jQuery.fn.getDataBox = function () {
	'use strict';
	var domShapeData = this.data();
	if (domShapeData && domShapeData.width && domShapeData.height) {
		return {
			top: domShapeData.y,
			left: domShapeData.x,
			width: domShapeData.width,
			height: domShapeData.height
		};
	}
	return this.getBox();
};


jQuery.fn.animateConnectorToPosition = function (animationOptions, tolerance) {
	'use strict';
	var element = jQuery(this),
		shapeFrom = element.data('nodeFrom'),
		shapeTo = element.data('nodeTo'),
		fromBox = shapeFrom && shapeFrom.getDataBox(),
		toBox = shapeTo && shapeTo.getDataBox(),
		oldBox = {
			from: shapeFrom && shapeFrom.getBox(),
			to: shapeTo && shapeTo.getBox()
		};
	tolerance = tolerance || 1;
	if (fromBox && toBox && oldBox && oldBox.from.width === fromBox.width &&
		oldBox.to.width   === toBox.width   &&
		oldBox.from.height  === fromBox.height    &&
		oldBox.to.height  === toBox.height    &&
		Math.abs(oldBox.from.top - oldBox.to.top - (fromBox.top - toBox.top)) < tolerance &&
		Math.abs(oldBox.from.left - oldBox.to.left - (fromBox.left - toBox.left)) < tolerance) {

		element.animate({
			left: Math.round(Math.min(fromBox.left, toBox.left)),
			top: Math.round(Math.min(fromBox.top, toBox.top))
		}, animationOptions);
		return true;
	}
	return false;
};
jQuery.fn.queueFadeOut = function (options) {
	'use strict';
	var element = this;
	return element.fadeOut(_.extend({
		complete: function () {
			if (element.is(':focus')) {
				element.parents('[tabindex]').focus();
			}
			element.remove();
		}
	}, options));
};
jQuery.fn.queueFadeIn = function (options) {
	'use strict';
	var element = this;
	return element
		.css('opacity', 0)
		.animate(
			{'opacity': 1},
			_.extend({ complete: function () {
				element.css('opacity', '');
			}}, options)
		);
};

jQuery.fn.updateStage = function () {
	'use strict';
	var data = this.data(),
		size = {
			'min-width': Math.round(data.width - data.offsetX),
			'min-height': Math.round(data.height - data.offsetY),
			'width': Math.round(data.width - data.offsetX),
			'height': Math.round(data.height - data.offsetY),
			'transform-origin': 'top left',
			'transform': 'translate3d(' + Math.round(data.offsetX) + 'px, ' + Math.round(data.offsetY) + 'px, 0)'
		};
	if (data.scale && data.scale !== 1) {
		size.transform = 'scale(' + data.scale + ') translate(' + Math.round(data.offsetX) + 'px, ' + Math.round(data.offsetY) + 'px)';
	}
	this.css(size);
	return this;
};

MAPJS.DOMRender.curvedPath = function (parent, child) {
	'use strict';
	var horizontalConnector = function (parentX, parentY, parentWidth, parentHeight,
				childX, childY, childWidth, childHeight) {
			var childHorizontalOffset = parentX < childX ? 0.1 : 0.9,
				parentHorizontalOffset = 1 - childHorizontalOffset;
			return {
				from: {
					x: parentX + parentHorizontalOffset * parentWidth,
					y: parentY + 0.5 * parentHeight
				},
				to: {
					x: childX + childHorizontalOffset * childWidth,
					y: childY + 0.5 * childHeight
				},
				controlPointOffset: 0
			};
		},
		calculateConnector = function (parent, child) {
			var tolerance = 10,
				childHorizontalOffset,
				childMid = child.top + child.height * 0.5,
				parentMid = parent.top + parent.height * 0.5;
			if (Math.abs(parentMid - childMid) + tolerance < Math.max(child.height, parent.height * 0.75)) {
				return horizontalConnector(parent.left, parent.top, parent.width, parent.height, child.left, child.top, child.width, child.height);
			}
			childHorizontalOffset = parent.left < child.left ? 0 : 1;
			return {
				from: {
					x: parent.left + 0.5 * parent.width,
					y: parent.top + 0.5 * parent.height
				},
				to: {
					x: child.left + childHorizontalOffset * child.width,
					y: child.top + 0.5 * child.height
				},
				controlPointOffset: 0.75
			};
		},
		position = {
			left: Math.min(parent.left, child.left),
			top: Math.min(parent.top, child.top)
		},
		calculatedConnector, offset, maxOffset;
	position.width = Math.max(parent.left + parent.width, child.left + child.width, position.left + 1) - position.left;
	position.height = Math.max(parent.top + parent.height, child.top + child.height, position.top + 1) - position.top;

	calculatedConnector = calculateConnector(parent, child);
	offset = calculatedConnector.controlPointOffset * (calculatedConnector.from.y - calculatedConnector.to.y);
	maxOffset = Math.min(child.height, parent.height) * 1.5;
	offset = Math.max(-maxOffset, Math.min(maxOffset, offset));
	return {
		'd': 'M' + Math.round(calculatedConnector.from.x - position.left) + ',' + Math.round(calculatedConnector.from.y - position.top) +
			'Q' + Math.round(calculatedConnector.from.x - position.left) + ',' + Math.round(calculatedConnector.to.y - offset - position.top) + ' ' + Math.round(calculatedConnector.to.x - position.left) + ',' + Math.round(calculatedConnector.to.y - position.top),
		// 'conn': calculatedConnector,
		'position': position
	};
};
MAPJS.DOMRender.straightPath = function (parent, child) {
	'use strict';
	var calculateConnector = function (parent, child) {
		var parentPoints = [
			{
				x: parent.left + 0.5 * parent.width,
				y: parent.top
			},
			{
				x: parent.left + parent.width,
				y: parent.top + 0.5 * parent.height
			},
			{
				x: parent.left + 0.5 * parent.width,
				y: parent.top + parent.height
			},
			{
				x: parent.left,
				y: parent.top + 0.5 * parent.height
			}
		], childPoints = [
			{
				x: child.left + 0.5 * child.width,
				y: child.top
			},
			{
				x: child.left + child.width,
				y: child.top + 0.5 * child.height
			},
			{
				x: child.left + 0.5 * child.width,
				y: child.top + child.height
			},
			{
				x: child.left,
				y: child.top + 0.5 * child.height
			}
		], i, j, min = Infinity, bestParent, bestChild, dx, dy, current;
		for (i = 0; i < parentPoints.length; i += 1) {
			for (j = 0; j < childPoints.length; j += 1) {
				dx = parentPoints[i].x - childPoints[j].x;
				dy = parentPoints[i].y - childPoints[j].y;
				current = dx * dx + dy * dy;
				if (current < min) {
					bestParent = i;
					bestChild = j;
					min = current;
				}
			}
		}
		return {
			from: parentPoints[bestParent],
			to: childPoints[bestChild]
		};
	},
	position = {
		left: Math.min(parent.left, child.left),
		top: Math.min(parent.top, child.top)
	},
	conn = calculateConnector(parent, child);
	position.width = Math.max(parent.left + parent.width, child.left + child.width, position.left + 1) - position.left;
	position.height = Math.max(parent.top + parent.height, child.top + child.height, position.top + 1) - position.top;

	return {
		'd': 'M' + Math.round(conn.from.x - position.left) + ',' + Math.round(conn.from.y - position.top) + 'L' + Math.round(conn.to.x - position.left) + ',' + Math.round(conn.to.y - position.top),
		'conn': conn,
		'position': position
	};
};

MAPJS.DOMRender.nodeConnectorPath = MAPJS.DOMRender.curvedPath;
MAPJS.DOMRender.linkConnectorPath = MAPJS.DOMRender.straightPath;

jQuery.fn.updateConnector = function (canUseData) {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			shapeFrom = element.data('nodeFrom'),
			shapeTo = element.data('nodeTo'),
			connection, pathElement, fromBox, toBox, changeCheck;
		if (!shapeFrom || !shapeTo || shapeFrom.length === 0 || shapeTo.length === 0) {
			element.hide();
			return;
		}
		if (canUseData) {
			fromBox = shapeFrom.getDataBox();
			toBox = shapeTo.getDataBox();
		} else {
			fromBox = shapeFrom.getBox();
			toBox = shapeTo.getBox();
		}
		changeCheck = {from: fromBox, to: toBox};
		if (_.isEqual(changeCheck, element.data('changeCheck'))) {
			return;
		}

		element.data('changeCheck', changeCheck);
		connection = MAPJS.DOMRender.nodeConnectorPath(fromBox, toBox);
		pathElement = element.find('path');
		element.css(connection.position);
		if (pathElement.length === 0) {
			pathElement = MAPJS.createSVG('path').attr('class', 'mapjs-connector').appendTo(element);
		}
		// if only the relative position changed, do not re-update the curve!!!!
		pathElement.attr('d',
			connection.d
		);
	});
};

jQuery.fn.updateLink = function () {
	'use strict';
	return jQuery.each(this, function () {
		var element = jQuery(this),
			shapeFrom = element.data('nodeFrom'),
			shapeTo = element.data('nodeTo'),
			connection,
			pathElement = element.find('path.mapjs-link'),
			hitElement = element.find('path.mapjs-link-hit'),
			arrowElement = element.find('path.mapjs-arrow'),
			n = Math.tan(Math.PI / 9),
			dashes = {
				dashed: '8, 8',
				solid: ''
			},
			attrs = _.pick(element.data(), 'lineStyle', 'arrow', 'color'),
			fromBox, toBox, changeCheck,
			a1x, a1y, a2x, a2y, len, iy, m, dx, dy;
		if (!shapeFrom || !shapeTo || shapeFrom.length === 0 || shapeTo.length === 0) {
			element.hide();
			return;
		}
		fromBox = shapeFrom.getBox();
		toBox = shapeTo.getBox();

		changeCheck = {from: fromBox, to: toBox, attrs: attrs};
		if (_.isEqual(changeCheck, element.data('changeCheck'))) {
			return;
		}

		element.data('changeCheck', changeCheck);

		connection = MAPJS.DOMRender.linkConnectorPath(fromBox, toBox);
		element.css(connection.position);

		if (pathElement.length === 0) {
			pathElement = MAPJS.createSVG('path').attr('class', 'mapjs-link').appendTo(element);
		}
		pathElement.attr({
			'd': connection.d,
			'stroke-dasharray': dashes[attrs.lineStyle]
		}).css('stroke', attrs.color);

		if (hitElement.length === 0) {
			hitElement = MAPJS.createSVG('path').attr('class', 'mapjs-link-hit').appendTo(element);
		}
		hitElement.attr({
			'd': connection.d
		});

		if (attrs.arrow) {
			if (arrowElement.length === 0) {
				arrowElement = MAPJS.createSVG('path').attr('class', 'mapjs-arrow').appendTo(element);
			}
			len = 14;
			dx = connection.conn.to.x - connection.conn.from.x;
			dy = connection.conn.to.y - connection.conn.from.y;
			if (dx === 0) {
				iy = dy < 0 ? -1 : 1;
				a1x = connection.conn.to.x + len * Math.sin(n) * iy;
				a2x = connection.conn.to.x - len * Math.sin(n) * iy;
				a1y = connection.conn.to.y - len * Math.cos(n) * iy;
				a2y = connection.conn.to.y - len * Math.cos(n) * iy;
			} else {
				m = dy / dx;
				if (connection.conn.from.x < connection.conn.to.x) {
					len = -len;
				}
				a1x = connection.conn.to.x + (1 - m * n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				a1y = connection.conn.to.y + (m + n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				a2x = connection.conn.to.x + (1 + m * n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
				a2y = connection.conn.to.y + (m - n) * len / Math.sqrt((1 + m * m) * (1 + n * n));
			}
			arrowElement.attr('d',
				'M' + Math.round(a1x - connection.position.left) + ',' + Math.round(a1y - connection.position.top) +
				'L' + Math.round(connection.conn.to.x - connection.position.left) + ',' + Math.round(connection.conn.to.y - connection.position.top) +
				'L' + Math.round(a2x - connection.position.left) + ',' + Math.round(a2y - connection.position.top) +
				'Z')
				.css('fill', attrs.color)
				.show();
		} else {
			arrowElement.hide();
		}

	});
};

jQuery.fn.addNodeCacheMark = function (idea) {
	'use strict';
	this.data('nodeCacheMark', MAPJS.DOMRender.nodeCacheMark(idea));
};

jQuery.fn.updateNodeContent = function (nodeContent, resourceTranslator) {
	'use strict';
	var MAX_URL_LENGTH = 25,
		self = jQuery(this),
		textSpan = function () {
			var span = self.find('[data-mapjs-role=title]');
			if (span.length === 0) {
				span = jQuery('<span>').attr('data-mapjs-role', 'title').appendTo(self);
			}
			return span;
		},
		applyLinkUrl = function (title) {
			var url = MAPJS.URLHelper.getLink(title),
				element = self.find('a.mapjs-hyperlink');
			if (!url) {
				element.hide();
				return;
			}
			if (element.length === 0) {
				element = jQuery('<a target="_blank" class="mapjs-hyperlink"></a>').appendTo(self);
			}
			element.attr('href', url).show();
		},
		applyLabel = function (label) {
			var element = self.find('.mapjs-label');
			if (!label && label !== 0) {
				element.hide();
				return;
			}
			if (element.length === 0) {
				element = jQuery('<span class="mapjs-label"></span>').appendTo(self);
			}
			element.text(label).show();
		},
		applyAttachment = function () {
			var attachment = nodeContent.attr && nodeContent.attr.attachment,
				element = self.find('a.mapjs-attachment');
			if (!attachment) {
				element.hide();
				return;
			}
			if (element.length === 0) {
				element = jQuery('<a href="#" class="mapjs-attachment"></a>').appendTo(self).click(function () {
					self.trigger('attachment-click');
				});
			}
			element.show();
		},
		updateText = function (title) {
			var text = MAPJS.URLHelper.stripLink(title) ||
					(title.length < MAX_URL_LENGTH ? title : (title.substring(0, MAX_URL_LENGTH) + '...')),
					nodeTextPadding = MAPJS.DOMRender.nodeTextPadding || 11,
					element = textSpan(),
					domElement = element[0],
					height;

			element.text(text.trim());
			self.data('title', title);
			element.css({'max-width': '', 'min-width': ''});
			if ((domElement.scrollWidth - nodeTextPadding) > domElement.offsetWidth) {
				element.css('max-width', domElement.scrollWidth + 'px');
			} else {
				height = domElement.offsetHeight;
				element.css('min-width', element.css('max-width'));
				if (domElement.offsetHeight === height) {
					element.css('min-width', '');
				}
			}
		},
		setCollapseClass = function () {
			if (nodeContent.attr && nodeContent.attr.collapsed) {
				self.addClass('collapsed');
			} else {
				self.removeClass('collapsed');
			}
		},
		foregroundClass = function (backgroundColor) {
			/*jslint newcap:true*/
			var luminosity = Color(backgroundColor).mix(Color('#EEEEEE')).luminosity();
			if (luminosity < 0.5) {
				return 'mapjs-node-dark';
			} else if (luminosity < 0.9) {
				return 'mapjs-node-light';
			}
			return 'mapjs-node-white';
		},
		setColors = function () {
			var fromStyle = nodeContent.attr && nodeContent.attr.style && nodeContent.attr.style.background;
			if (fromStyle === 'false' || fromStyle === 'transparent') {
				fromStyle = false;
			}
			self.removeClass('mapjs-node-dark mapjs-node-white mapjs-node-light');
			if (fromStyle) {
				self.css('background-color', fromStyle);
				self.addClass(foregroundClass(fromStyle));
			} else {
				self.css('background-color', '');
			}
		},
		setIcon = function (icon) {
			var textBox = textSpan(),
				textHeight,
				textWidth,
				maxTextWidth,
				padding,
				selfProps = {
					'min-height': '',
					'min-width': '',
					'background-image': '',
					'background-repeat': '',
					'background-size': '',
					'background-position': ''
				},
				textProps = {
					'margin-top': '',
					'margin-left': ''
				};
			self.css({padding: ''});
			if (icon) {
				padding = parseInt(self.css('padding-left'), 10);
				textHeight = textBox.outerHeight();
				textWidth = textBox.outerWidth();
				maxTextWidth = parseInt(textBox.css('max-width'), 10);
				_.extend(selfProps, {
					'background-image': 'url("' + (resourceTranslator ? resourceTranslator(icon.url) : icon.url) + '")',
					'background-repeat': 'no-repeat',
					'background-size': icon.width + 'px ' + icon.height + 'px',
					'background-position': 'center center'
				});
				if (icon.position === 'top' || icon.position === 'bottom') {
					if (icon.position === 'top') {
						selfProps['background-position'] = 'center ' + padding + 'px';
					} else if (MAPJS.DOMRender.fixedLayout) {
						selfProps['background-position'] = 'center ' + (padding + textHeight) + 'px';
					} else {
						selfProps['background-position'] = 'center ' + icon.position + ' ' + padding + 'px';
					}

					selfProps['padding-' + icon.position] = icon.height + (padding * 2);
					selfProps['min-width'] = icon.width;
					if (icon.width > maxTextWidth) {
						textProps['margin-left'] =  (icon.width - maxTextWidth) / 2;
					}
				} else if (icon.position === 'left' || icon.position === 'right') {
					if (icon.position === 'left') {
						selfProps['background-position'] = padding + 'px center';
					} else if (MAPJS.DOMRender.fixedLayout) {
						selfProps['background-position'] = (textWidth + (2 * padding)) + 'px center ';
					} else {
						selfProps['background-position'] = icon.position + ' ' + padding + 'px center';
					}

					selfProps['padding-' + icon.position] = icon.width + (padding * 2);
					if (icon.height > textHeight) {
						textProps['margin-top'] =  (icon.height - textHeight) / 2;
						selfProps['min-height'] = icon.height;
					}
				} else {
					if (icon.height > textHeight) {
						textProps['margin-top'] =  (icon.height - textHeight) / 2;
						selfProps['min-height'] = icon.height;
					}
					selfProps['min-width'] = icon.width;
					if (icon.width > maxTextWidth) {
						textProps['margin-left'] =  (icon.width - maxTextWidth) / 2;
					}
				}
			}
			self.css(selfProps);
			textBox.css(textProps);
		};
	self.attr('mapjs-level', nodeContent.level);
	updateText(nodeContent.title);
	applyLinkUrl(nodeContent.title);
	applyLabel(nodeContent.label);
	applyAttachment();
	self.data({'x': Math.round(nodeContent.x), 'y': Math.round(nodeContent.y), 'width': Math.round(nodeContent.width), 'height': Math.round(nodeContent.height), 'nodeId': nodeContent.id})
		.addNodeCacheMark(nodeContent);
	setColors();
	setIcon(nodeContent.attr && nodeContent.attr.icon);
	setCollapseClass();
	return self;
};
jQuery.fn.placeCaretAtEnd = function () {
	'use strict';
	var el = this[0],
		range, sel, textRange;
	if (window.getSelection && document.createRange) {
		range = document.createRange();
		range.selectNodeContents(el);
		range.collapse(false);
		sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	} else if (document.body.createTextRange) {
		textRange = document.body.createTextRange();
		textRange.moveToElementText(el);
		textRange.collapse(false);
		textRange.select();
	}
};
jQuery.fn.selectAll = function () {
	'use strict';
	var el = this[0],
		range, sel, textRange;
	if (window.getSelection && document.createRange) {
		range = document.createRange();
		range.selectNodeContents(el);
		sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	} else if (document.body.createTextRange) {
		textRange = document.body.createTextRange();
		textRange.moveToElementText(el);
		textRange.select();
	}
};
jQuery.fn.innerText = function () {
	'use strict';
	var htmlContent = this.html(),
			containsBr = /<br\/?>/.test(htmlContent);
	if (!containsBr) {
		return this.text();
	}
	return htmlContent.replace(/<br\/?>/gi, '\n').replace(/(<([^>]+)>)/gi, '');
};
jQuery.fn.editNode = function (shouldSelectAll) {
	'use strict';
	var node = this,
		textBox = this.find('[data-mapjs-role=title]'),
		unformattedText = this.data('title'),
		originalText = textBox.text(),
		result = jQuery.Deferred(),
		clear = function () {
			detachListeners();
			textBox.css('word-break', '');
			textBox.removeAttr('contenteditable');
			node.shadowDraggable();
		},
		finishEditing = function () {
			var content = textBox.innerText();
			if (content === unformattedText) {
				return cancelEditing();
			}
			clear();
			result.resolve(content);
		},
		cancelEditing = function () {
			clear();
			textBox.text(originalText);
			result.reject();
		},
		keyboardEvents = function (e) {
			var ENTER_KEY_CODE = 13,
				ESC_KEY_CODE = 27,
				TAB_KEY_CODE = 9,
				S_KEY_CODE = 83,
				Z_KEY_CODE = 90;
			if (e.shiftKey && e.which === ENTER_KEY_CODE) {
				return; // allow shift+enter to break lines
			} else if (e.which === ENTER_KEY_CODE) {
				finishEditing();
				e.stopPropagation();
			} else if (e.which === ESC_KEY_CODE) {
				cancelEditing();
				e.stopPropagation();
			} else if (e.which === TAB_KEY_CODE || (e.which === S_KEY_CODE && (e.metaKey || e.ctrlKey) && !e.altKey)) {
				finishEditing();
				e.preventDefault(); /* stop focus on another object */
			} else if (!e.shiftKey && e.which === Z_KEY_CODE && (e.metaKey || e.ctrlKey) && !e.altKey) { /* undo node edit on ctrl+z if text was not changed */
				if (textBox.text() === unformattedText) {
					cancelEditing();
				}
				e.stopPropagation();
			}
		},
		attachListeners = function () {
			textBox.on('blur', finishEditing).on('keydown', keyboardEvents);
		},
		detachListeners = function () {
			textBox.off('blur', finishEditing).off('keydown', keyboardEvents);
		};
	attachListeners();
	if (unformattedText !== originalText) { /* links or some other potential formatting issues */
		textBox.css('word-break', 'break-all');
	}
	textBox.text(unformattedText).attr('contenteditable', true).focus();
	if (shouldSelectAll) {
		textBox.selectAll();
	} else if (unformattedText) {
		textBox.placeCaretAtEnd();
	}
	node.shadowDraggable({disable: true});
	return result.promise();
};
jQuery.fn.updateReorderBounds = function (border, box) {
	'use strict';
	var element = this;
	if (!border) {
		element.hide();
		return;
	}
	element.show();
	element.attr('mapjs-edge', border.edge);
	element.css({
		top: box.y + box.height / 2 - element.height() / 2,
		left: border.x - (border.edge === 'left' ? element.width() : 0)
	});

};

(function () {
	'use strict';
	var cleanDOMId = function (s) {
			return s.replace(/\./g, '_');
		},
		connectorKey = function (connectorObj) {
			return cleanDOMId('connector_' + connectorObj.from + '_' + connectorObj.to);
		},
		linkKey = function (linkObj) {
			return cleanDOMId('link_' + linkObj.ideaIdFrom + '_' + linkObj.ideaIdTo);
		},
		nodeKey = function (id) {
			return cleanDOMId('node_' + id);
		};

	jQuery.fn.createNode = function (node) {
		return jQuery('<div>')
			.attr({'id': nodeKey(node.id), 'tabindex': 0, 'data-mapjs-role': 'node' })
			.css({display: 'block', position: 'absolute'})
			.addClass('mapjs-node')
			.appendTo(this);
	};
	jQuery.fn.createConnector = function (connector) {
		return MAPJS.createSVG()
			.attr({'id': connectorKey(connector), 'data-mapjs-role': 'connector', 'class': 'mapjs-draw-container'})
			.data({'nodeFrom': this.nodeWithId(connector.from), 'nodeTo': this.nodeWithId(connector.to)})
			.appendTo(this);
	};
	jQuery.fn.createLink = function (l) {
		var defaults = _.extend({color: 'red', lineStyle: 'dashed'}, l.attr && l.attr.style);
		return MAPJS.createSVG()
			.attr({
				'id': linkKey(l),
				'data-mapjs-role': 'link',
				'class': 'mapjs-draw-container'
			})
			.data({'nodeFrom': this.nodeWithId(l.ideaIdFrom), 'nodeTo': this.nodeWithId(l.ideaIdTo) })
			.data(defaults)
			.appendTo(this);
	};
	jQuery.fn.nodeWithId = function (id) {
		return this.find('#' + nodeKey(id));
	};
	jQuery.fn.findConnector = function (connectorObj) {
		return this.find('#' + connectorKey(connectorObj));
	};
	jQuery.fn.findLink = function (linkObj) {
		return this.find('#' + linkKey(linkObj));
	};
	jQuery.fn.createReorderBounds = function () {
		var result = jQuery('<div>').attr({
			'data-mapjs-role': 'reorder-bounds',
			'class': 'mapjs-reorder-bounds'
		}).hide().css('position', 'absolute').appendTo(this);
		return result;
	};
})();

MAPJS.DOMRender.viewController = function (mapModel, stageElement, touchEnabled, imageInsertController, resourceTranslator, options) {
	'use strict';
	var viewPort = stageElement.parent(),
		connectorsForAnimation = jQuery(),
		linksForAnimation = jQuery(),
		nodeAnimOptions = { duration: 400, queue: 'nodeQueue', easing: 'linear' },
		reorderBounds = mapModel.isEditingEnabled() ? stageElement.createReorderBounds() : jQuery('<div>'),
		getViewPortDimensions = function () {
			if (viewPortDimensions) {
				return viewPortDimensions;
			}
			viewPortDimensions =  {
				left: viewPort.scrollLeft(),
				top: viewPort.scrollTop(),
				innerWidth: viewPort.innerWidth(),
				innerHeight: viewPort.innerHeight()
			};
			return viewPortDimensions;
		},
		stageToViewCoordinates = function (x, y) {
			var stage = stageElement.data(),
				scrollPosition = getViewPortDimensions();
			return {
				x: stage.scale * (x + stage.offsetX) - scrollPosition.left,
				y: stage.scale * (y + stage.offsetY) - scrollPosition.top
			};
		},
		viewToStageCoordinates = function (x, y) {
			var stage = stageElement.data(),
				scrollPosition = getViewPortDimensions();
			return {
				x: (scrollPosition.left + x) / stage.scale - stage.offsetX,
				y: (scrollPosition.top + y) / stage.scale - stage.offsetY
			};
		},
		updateScreenCoordinates = function () {
			var element = jQuery(this);
			element.css({
				'left': element.data('x'),
				'top' : element.data('y')
			}).trigger('mapjs:move');
		},
		animateToPositionCoordinates = function () {
			var element = jQuery(this);
			element.clearQueue(nodeAnimOptions.queue).animate({
				'left': element.data('x'),
				'top' : element.data('y'),
				'opacity': 1 /* previous animation can be cancelled with clearqueue, so ensure it gets visible */
			}, _.extend({
				complete: function () {
					element.css('opacity', '');
					element.each(updateScreenCoordinates);
				}
			}, nodeAnimOptions)).trigger('mapjs:animatemove');
		},
		ensureSpaceForPoint = function (x, y) {/* in stage coordinates */
			var stage = stageElement.data(),
				dirty = false;
			if (x < -1 * stage.offsetX) {
				stage.width =  stage.width - stage.offsetX - x;
				stage.offsetX = -1 * x;
				dirty = true;
			}
			if (y < -1 * stage.offsetY) {
				stage.height = stage.height - stage.offsetY - y;
				stage.offsetY = -1 * y;
				dirty = true;
			}
			if (x > stage.width - stage.offsetX) {
				stage.width = stage.offsetX + x;
				dirty = true;
			}
			if (y > stage.height - stage.offsetY) {
				stage.height = stage.offsetY + y;
				dirty = true;
			}
			if (dirty) {
				stageElement.updateStage();
			}
		},
		ensureSpaceForNode = function () {
			return jQuery(this).each(function () {
				var node = jQuery(this).data(),
					margin = MAPJS.DOMRender.stageMargin || {top: 0, left: 0, bottom: 0, right: 0};
				/* sequence of calculations is important because maxX and maxY take into consideration the new offsetX snd offsetY */
				ensureSpaceForPoint(node.x - margin.left, node.y - margin.top);
				ensureSpaceForPoint(node.x + node.width + margin.right, node.y + node.height + margin.bottom);
			});
		},
		centerViewOn = function (x, y, animate) { /*in the stage coordinate system*/
			var stage = stageElement.data(),
				viewPortCenter = {
					x: viewPort.innerWidth() / 2,
					y: viewPort.innerHeight() / 2
				},
				newLeftScroll, newTopScroll,
				margin = MAPJS.DOMRender.stageVisibilityMargin || {top: 0, left: 0, bottom: 0, right: 0};
			ensureSpaceForPoint(x - viewPortCenter.x / stage.scale, y - viewPortCenter.y / stage.scale);
			ensureSpaceForPoint(x + viewPortCenter.x / stage.scale - margin.left, y + viewPortCenter.y / stage.scale - margin.top);

			newLeftScroll = stage.scale * (x + stage.offsetX) - viewPortCenter.x;
			newTopScroll = stage.scale * (y + stage.offsetY) - viewPortCenter.y;
			viewPort.finish();
			if (animate) {
				viewPort.animate({
					scrollLeft: newLeftScroll,
					scrollTop: newTopScroll
				}, {
					duration: 400
				});
			} else {
				viewPort.scrollLeft(newLeftScroll);
				viewPort.scrollTop(newTopScroll);
			}
		},
		stagePointAtViewportCenter = function () {
			return viewToStageCoordinates(viewPort.innerWidth() / 2, viewPort.innerHeight() / 2);
		},
		ensureNodeVisible = function (domElement) {
			if (!domElement || domElement.length === 0) {
				return;
			}
			viewPort.finish();
			var node = domElement.data(),
				nodeTopLeft = stageToViewCoordinates(node.x, node.y),
				nodeBottomRight = stageToViewCoordinates(node.x + node.width, node.y + node.height),
				animation = {},
				margin = MAPJS.DOMRender.stageVisibilityMargin || {top: 10, left: 10, bottom: 10, right: 10};
			if ((nodeTopLeft.x - margin.left) < 0) {
				animation.scrollLeft = viewPort.scrollLeft() + nodeTopLeft.x - margin.left;
			} else if ((nodeBottomRight.x + margin.right) > viewPort.innerWidth()) {
				animation.scrollLeft = viewPort.scrollLeft() + nodeBottomRight.x - viewPort.innerWidth() + margin.right;
			}
			if ((nodeTopLeft.y - margin.top) < 0) {
				animation.scrollTop = viewPort.scrollTop() + nodeTopLeft.y - margin.top;
			} else if ((nodeBottomRight.y + margin.bottom) > viewPort.innerHeight()) {
				animation.scrollTop = viewPort.scrollTop() + nodeBottomRight.y - viewPort.innerHeight() + margin.bottom;
			}
			if (!_.isEmpty(animation)) {
				viewPort.animate(animation, {duration: 100});
			}
		},
		viewportCoordinatesForPointEvent = function (evt) {
			var dropPosition = (evt && evt.gesture && evt.gesture.center) || evt,
				vpOffset = viewPort.offset(),
				result;
			if (dropPosition) {
				result = {
					x: dropPosition.pageX - vpOffset.left,
					y: dropPosition.pageY -  vpOffset.top
				};
				if (result.x >= 0 && result.x <= viewPort.innerWidth() && result.y >= 0 && result.y <= viewPort.innerHeight()) {
					return result;
				}
			}
		},
		stagePositionForPointEvent = function (evt) {
			var viewportDropCoordinates = viewportCoordinatesForPointEvent(evt);
			if (viewportDropCoordinates) {
				return viewToStageCoordinates(viewportDropCoordinates.x, viewportDropCoordinates.y);
			}
		},
		clearCurrentDroppable = function () {
			if (currentDroppable || currentDroppable === false) {
				jQuery('.mapjs-node').removeClass('droppable');
				currentDroppable = undefined;
			}
		},
		showDroppable = function (nodeId) {
			stageElement.nodeWithId(nodeId).addClass('droppable');
			currentDroppable = nodeId;
		},
		currentDroppable = false,
		viewPortDimensions,
		withinReorderBoundary = function (boundaries, box) {
			if (_.isEmpty(boundaries)) {
				return false;
			}
			if (!box) {
				return false;
			}
			var closeTo = function (reorderBoundary) {
					var nodeX = box.x;
					if (reorderBoundary.edge === 'right') {
						nodeX += box.width;
					}
					return Math.abs(nodeX - reorderBoundary.x) < reorderBoundary.margin * 2 &&
						box.y < reorderBoundary.maxY &&
						box.y > reorderBoundary.minY;
				};
			return _.find(boundaries, closeTo);
		};


	viewPort.on('scroll', function () {
		viewPortDimensions = undefined;
	});
	if (imageInsertController) {
		imageInsertController.addEventListener('imageInserted', function (dataUrl, imgWidth, imgHeight, evt) {
			var point = stagePositionForPointEvent(evt);
			mapModel.dropImage(dataUrl, imgWidth, imgHeight, point && point.x, point && point.y);
		});
	}
	mapModel.addEventListener('nodeCreated', function (node) {
		var currentReorderBoundary,
			element = stageElement.createNode(node)
			.queueFadeIn(nodeAnimOptions)
			.updateNodeContent(node, resourceTranslator)
			.on('tap', function (evt) {

				var realEvent = (evt.gesture && evt.gesture.srcEvent) || evt;
				if (realEvent.button && realEvent.button !== -1) {
					return;
				}
				mapModel.clickNode(node.id, realEvent);
				if (evt) {
					evt.stopPropagation();
				}
				if (evt && evt.gesture) {
					evt.gesture.stopPropagation();
				}

			})
			.on('doubletap', function (event) {
				if (event) {
					event.stopPropagation();
					if (event.gesture) {
						event.gesture.stopPropagation();
					}
				}
				if (!mapModel.isEditingEnabled()) {
					mapModel.toggleCollapse('mouse');
					return;
				}
				mapModel.editNode('mouse');
			})
			.on('attachment-click', function () {
				mapModel.openAttachment('mouse', node.id);
			})
			.each(ensureSpaceForNode)
			.each(updateScreenCoordinates)
			.on('mm:start-dragging mm:start-dragging-shadow', function () {
				mapModel.selectNode(node.id);
				currentReorderBoundary = mapModel.getReorderBoundary(node.id);
				element.addClass('dragging');
			})
			.on('mm:drag', function (evt) {
				var dropCoords = stagePositionForPointEvent(evt),
					currentPosition = evt.currentPosition && stagePositionForPointEvent({pageX: evt.currentPosition.left, pageY: evt.currentPosition.top}),
					nodeId,
					hasShift = evt && evt.gesture && evt.gesture.srcEvent && evt.gesture.srcEvent.shiftKey,
					border;
				if (!dropCoords) {
					clearCurrentDroppable();
					return;
				}

				nodeId = mapModel.getNodeIdAtPosition(dropCoords.x, dropCoords.y);
				if (!hasShift && !nodeId && currentPosition) {
					currentPosition.width = element.outerWidth();
					currentPosition.height = element.outerHeight();
					border = withinReorderBoundary(currentReorderBoundary, currentPosition);
					reorderBounds.updateReorderBounds(border, currentPosition);
				} else {
					reorderBounds.hide();
				}
				if (!nodeId || nodeId === node.id) {
					clearCurrentDroppable();
				} else if (nodeId !== currentDroppable) {
					clearCurrentDroppable();
					if (nodeId) {
						showDroppable(nodeId);
					}
				}
			})
			.on('contextmenu', function (event) {
				mapModel.selectNode(node.id);
				if (mapModel.requestContextMenu(event.pageX, event.pageY)) {
					event.preventDefault();
					return false;
				}
			})
			.on('mm:stop-dragging', function (evt) {
				element.removeClass('dragging');
				reorderBounds.hide();
				var isShift = evt && evt.gesture && evt.gesture.srcEvent && evt.gesture.srcEvent.shiftKey,
					stageDropCoordinates = stagePositionForPointEvent(evt),
					nodeAtDrop, finalPosition, dropResult, manualPosition, vpCenter;
				clearCurrentDroppable();
				if (!stageDropCoordinates) {
					return;
				}
				nodeAtDrop = mapModel.getNodeIdAtPosition(stageDropCoordinates.x, stageDropCoordinates.y);
				finalPosition = stagePositionForPointEvent({pageX: evt.finalPosition.left, pageY: evt.finalPosition.top});
				if (nodeAtDrop && nodeAtDrop !== node.id) {
					dropResult = mapModel.dropNode(node.id, nodeAtDrop, !!isShift);
				} else if (node.level > 1) {
					finalPosition.width = element.outerWidth();
					finalPosition.height = element.outerHeight();
					manualPosition = (!!isShift) || !withinReorderBoundary(currentReorderBoundary, finalPosition);
					dropResult = mapModel.positionNodeAt(node.id, finalPosition.x, finalPosition.y, manualPosition);
				} else if (node.level === 1 && evt.gesture) {
					vpCenter = stagePointAtViewportCenter();
					vpCenter.x -= evt.gesture.deltaX || 0;
					vpCenter.y -= evt.gesture.deltaY || 0;
					centerViewOn(vpCenter.x, vpCenter.y, true);
					dropResult = true;
				} else {
					dropResult = false;
				}
				return dropResult;
			})
			.on('mm:cancel-dragging', function () {
				clearCurrentDroppable();
				element.removeClass('dragging');
				reorderBounds.hide();
			});
		if (touchEnabled) {
			element.on('hold', function (evt) {
				var realEvent = (evt.gesture && evt.gesture.srcEvent) || evt;
				mapModel.clickNode(node.id, realEvent);
				if (mapModel.requestContextMenu(evt.gesture.center.pageX, evt.gesture.center.pageY)) {
					evt.preventDefault();
					if (evt.gesture) {
						evt.gesture.preventDefault();
						evt.gesture.stopPropagation();
					}
					return false;
				}
			});
		}
		element.css('min-width', element.css('width'));
		if (mapModel.isEditingEnabled()) {
			element.shadowDraggable();
		}
	});
	mapModel.addEventListener('nodeSelectionChanged', function (ideaId, isSelected) {
		var node = stageElement.nodeWithId(ideaId);
		if (isSelected) {
			node.addClass('selected');
			ensureNodeVisible(node);
		} else {
			node.removeClass('selected');
		}
	});
	mapModel.addEventListener('nodeRemoved', function (node) {
		stageElement.nodeWithId(node.id).queueFadeOut(nodeAnimOptions);
	});
	mapModel.addEventListener('nodeMoved', function (node /*, reason*/) {
		var currentViewPortDimensions = getViewPortDimensions(),
			nodeDom = stageElement.nodeWithId(node.id).data({
				'x': Math.round(node.x),
				'y': Math.round(node.y)
			}).each(ensureSpaceForNode),
			screenTopLeft = stageToViewCoordinates(Math.round(node.x), Math.round(node.y)),
			screenBottomRight = stageToViewCoordinates(Math.round(node.x + node.width), Math.round(node.y + node.height));
		if (screenBottomRight.x < 0 || screenBottomRight.y < 0 || screenTopLeft.x > currentViewPortDimensions.innerWidth || screenTopLeft.y > currentViewPortDimensions.innerHeight) {
			nodeDom.each(updateScreenCoordinates);
		} else {
			nodeDom.each(animateToPositionCoordinates);
		}
	});
	mapModel.addEventListener('nodeTitleChanged nodeAttrChanged nodeLabelChanged', function (n) {
		stageElement.nodeWithId(n.id).updateNodeContent(n, resourceTranslator);
	});
	mapModel.addEventListener('connectorCreated', function (connector) {
		var element = stageElement.createConnector(connector).queueFadeIn(nodeAnimOptions).updateConnector(true);
		stageElement.nodeWithId(connector.from).add(stageElement.nodeWithId(connector.to))
			.on('mapjs:move', function () {
				element.updateConnector(true);
			})
			.on('mm:drag', function () {
				element.updateConnector();
			})
			.on('mapjs:animatemove', function () {
				connectorsForAnimation = connectorsForAnimation.add(element);
			});
	});
	mapModel.addEventListener('connectorRemoved', function (connector) {
		stageElement.findConnector(connector).queueFadeOut(nodeAnimOptions);
	});
	mapModel.addEventListener('linkCreated', function (l) {
		var link = stageElement.createLink(l).queueFadeIn(nodeAnimOptions).updateLink();
		link.find('.mapjs-link-hit').on('tap', function (event) {
			mapModel.selectLink('mouse', l, { x: event.gesture.center.pageX, y: event.gesture.center.pageY });
			event.stopPropagation();
			event.gesture.stopPropagation();
		});
		stageElement.nodeWithId(l.ideaIdFrom).add(stageElement.nodeWithId(l.ideaIdTo))
			.on('mapjs:move mm:drag', function () {
				link.updateLink();
			})
			.on('mapjs:animatemove', function () {
				linksForAnimation = linksForAnimation.add(link);
			});

	});
	mapModel.addEventListener('linkRemoved', function (l) {
		stageElement.findLink(l).queueFadeOut(nodeAnimOptions);
	});
	mapModel.addEventListener('mapScaleChanged', function (scaleMultiplier /*, zoomPoint */) {
		var currentScale = stageElement.data('scale'),
			targetScale = Math.max(Math.min(currentScale * scaleMultiplier, 5), 0.2),
			currentCenter = stagePointAtViewportCenter();
		if (currentScale === targetScale) {
			return;
		}
		stageElement.data('scale', targetScale).updateStage();
		centerViewOn(currentCenter.x, currentCenter.y);
	});
	mapModel.addEventListener('nodeVisibilityRequested', function (ideaId) {
		var id = ideaId || mapModel.getCurrentlySelectedIdeaId(),
				node = stageElement.nodeWithId(id);
		if (node) {
			ensureNodeVisible(node);
			viewPort.finish();
		}

	});
	mapModel.addEventListener('nodeFocusRequested', function (ideaId) {
		var node = stageElement.nodeWithId(ideaId).data(),
			nodeCenterX = node.x + node.width / 2,
			nodeCenterY = node.y + node.height / 2;
		if (stageElement.data('scale') !== 1) {
			stageElement.data('scale', 1).updateStage();
		}
		centerViewOn(nodeCenterX, nodeCenterY, true);
	});
	mapModel.addEventListener('mapViewResetRequested', function () {
		stageElement.data({'scale': 1, 'height': 0, 'width': 0, 'offsetX': 0, 'offsetY': 0}).updateStage();
		stageElement.children().andSelf().finish(nodeAnimOptions.queue);
		jQuery(stageElement).find('.mapjs-node').each(ensureSpaceForNode);
		jQuery(stageElement).find('[data-mapjs-role=connector]').updateConnector(true);
		jQuery(stageElement).find('[data-mapjs-role=link]').updateLink();
		centerViewOn(0, 0);
		viewPort.focus();
	});
	mapModel.addEventListener('layoutChangeStarting', function () {
		viewPortDimensions = undefined;
		stageElement.children().finish(nodeAnimOptions.queue);
		stageElement.finish(nodeAnimOptions.queue);
	});
	mapModel.addEventListener('layoutChangeComplete', function () {
		var connectorGroupClone = jQuery(), linkGroupClone = jQuery();

		connectorsForAnimation.each(function () {
			if (!jQuery(this).animateConnectorToPosition(nodeAnimOptions, 2)) {
				connectorGroupClone = connectorGroupClone.add(this);
			}
		});
		linksForAnimation.each(function () {
			if (!jQuery(this).animateConnectorToPosition(nodeAnimOptions, 2)) {
				linkGroupClone = linkGroupClone.add(this);
			}
		});
		connectorsForAnimation = jQuery();
		linksForAnimation = jQuery();
		stageElement.animate({'opacity': 1}, _.extend({
			progress: function () {
				connectorGroupClone.updateConnector();
				linkGroupClone.updateLink();
			}
		}, nodeAnimOptions));
		ensureNodeVisible(stageElement.nodeWithId(mapModel.getCurrentlySelectedIdeaId()));
		stageElement.children().dequeue(nodeAnimOptions.queue);
		stageElement.dequeue(nodeAnimOptions.queue);
	});

	/* editing */
	if (!options || !options.inlineEditingDisabled) {
		mapModel.addEventListener('nodeEditRequested', function (nodeId, shouldSelectAll, editingNew) {
			var editingElement = stageElement.nodeWithId(nodeId);
			mapModel.setInputEnabled(false);
			viewPort.finish(); /* close any pending animations */
			editingElement.editNode(shouldSelectAll).done(
				function (newText) {
					mapModel.setInputEnabled(true);
					mapModel.updateTitle(nodeId, newText, editingNew);
					editingElement.focus();

				}).fail(function () {
					mapModel.setInputEnabled(true);
					if (editingNew) {
						mapModel.undo('internal');
					}
					editingElement.focus();
				});
		});
	}
	mapModel.addEventListener('addLinkModeToggled', function (isOn) {
		if (isOn) {
			stageElement.addClass('mapjs-add-link');
		} else {
			stageElement.removeClass('mapjs-add-link');
		}
	});
	mapModel.addEventListener('linkAttrChanged', function (l) {
		var  attr = _.extend({arrow: false}, l.attr && l.attr.style);
		stageElement.findLink(l).data(attr).updateLink();
	});

	mapModel.addEventListener('activatedNodesChanged', function (activatedNodes, deactivatedNodes) {
		_.each(activatedNodes, function (nodeId) {
			stageElement.nodeWithId(nodeId).addClass('activated');
		});
		_.each(deactivatedNodes, function (nodeId) {
			stageElement.nodeWithId(nodeId).removeClass('activated');
		});
	});
};

/*jslint nomen: true, newcap: true, browser: true*/
/*global MAPJS, $, _, jQuery*/

jQuery.fn.scrollWhenDragging = function (scrollPredicate) {
	/*jslint newcap:true*/
	'use strict';
	return this.each(function () {
		var element = $(this),
			dragOrigin;
		element.on('dragstart', function () {
			if (scrollPredicate()) {
				dragOrigin = {
					top: element.scrollTop(),
					left: element.scrollLeft()
				};
			}
		}).on('drag', function (e) {
			if (e.gesture && dragOrigin) {
				element.scrollTop(dragOrigin.top - e.gesture.deltaY);
				element.scrollLeft(dragOrigin.left - e.gesture.deltaX);
			}
		}).on('dragend', function () {
			dragOrigin = undefined;
		});
	});
};
$.fn.domMapWidget = function (activityLog, mapModel, touchEnabled, imageInsertController, dragContainer, resourceTranslator, centerSelectedNodeOnOrientationChange, options) {
	'use strict';
	var hotkeyEventHandlers = {
			'return': 'addSiblingIdea',
			'shift+return': 'addSiblingIdeaBefore',
			'del backspace': 'removeSubIdea',
			'tab insert': 'addSubIdea',
			'left': 'selectNodeLeft',
			'up': 'selectNodeUp',
			'right': 'selectNodeRight',
			'shift+right': 'activateNodeRight',
			'shift+left': 'activateNodeLeft',
			'meta+right ctrl+right meta+left ctrl+left': 'flip',
			'shift+up': 'activateNodeUp',
			'shift+down': 'activateNodeDown',
			'down': 'selectNodeDown',
			'space f2': 'editNode',
			'f': 'toggleCollapse',
			'c meta+x ctrl+x': 'cut',
			'p meta+v ctrl+v': 'paste',
			'y meta+c ctrl+c': 'copy',
			'u meta+z ctrl+z': 'undo',
			'shift+tab': 'insertIntermediate',
			'Esc 0 meta+0 ctrl+0': 'resetView',
			'r meta+shift+z ctrl+shift+z meta+y ctrl+y': 'redo',
			'meta+plus ctrl+plus z': 'scaleUp',
			'meta+minus ctrl+minus shift+z': 'scaleDown',
			'meta+up ctrl+up': 'moveUp',
			'meta+down ctrl+down': 'moveDown',
			'ctrl+shift+v meta+shift+v': 'pasteStyle',
			'Esc': 'cancelCurrentAction'
		},
		charEventHandlers = {
			'[' : 'activateChildren',
			'{'	: 'activateNodeAndChildren',
			'='	: 'activateSiblingNodes',
			'.'	: 'activateSelectedNode',
			'/' : 'toggleCollapse',
			'a' : 'openAttachment',
			'i' : 'editIcon'
		},
		actOnKeys = true,
		self = this;
	mapModel.addEventListener('inputEnabledChanged', function (canInput, holdFocus) {
		actOnKeys = canInput;
		if (canInput && !holdFocus) {
			self.focus();
		}
	});

	return this.each(function () {
		var element = $(this),
			stage = $('<div>').css({
				position: 'relative'
			}).attr('data-mapjs-role', 'stage').appendTo(element).data({
				'offsetX': element.innerWidth() / 2,
				'offsetY': element.innerHeight() / 2,
				'width': element.innerWidth() - 20,
				'height': element.innerHeight() - 20,
				'scale': 1
			}).updateStage(),
			previousPinchScale = false;
		element.css('overflow', 'auto').attr('tabindex', 1);
		if (mapModel.isEditingEnabled()) {
			(dragContainer || element).simpleDraggableContainer();
		}

		if (!touchEnabled) {
			element.scrollWhenDragging(mapModel.getInputEnabled); //no need to do this for touch, this is native
			element.on('mousedown', function (e) {
				if (e.target !== element[0]) {
					element.css('overflow', 'hidden');
				}
			});
			jQuery(document).on('mouseup', function () {
				if (element.css('overflow') !== 'auto') {
					element.css('overflow', 'auto');
				}
			});
			element.imageDropWidget(imageInsertController);
		} else {
			element.on('doubletap', function (event) {
				if (mapModel.requestContextMenu(event.gesture.center.pageX, event.gesture.center.pageY)) {
					event.preventDefault();
					event.gesture.preventDefault();
					return false;
				}
			}).on('pinch', function (event) {
				if (!event || !event.gesture || !event.gesture.scale) {
					return;
				}
				event.preventDefault();
				event.gesture.preventDefault();

				var scale = event.gesture.scale;
				if (previousPinchScale) {
					scale = scale / previousPinchScale;
				}
				if (Math.abs(scale - 1) < 0.05) {
					return;
				}
				previousPinchScale = event.gesture.scale;

				mapModel.scale('touch', scale, {
					x: event.gesture.center.pageX - stage.data('offsetX'),
					y: event.gesture.center.pageY - stage.data('offsetY')
				});
			}).on('gestureend', function () {
				previousPinchScale = false;
			});

		}
		MAPJS.DOMRender.viewController(mapModel, stage, touchEnabled, imageInsertController, resourceTranslator, options);
		_.each(hotkeyEventHandlers, function (mappedFunction, keysPressed) {
			element.keydown(keysPressed, function (event) {
				if (actOnKeys) {
					event.stopImmediatePropagation();
					event.preventDefault();
					mapModel[mappedFunction]('keyboard');
				}
			});
		});
		if (!touchEnabled) {
			jQuery(window).on('resize', function () {
				mapModel.resetView();
			});
		}

		jQuery(window).on('orientationchange', function () {
			if (centerSelectedNodeOnOrientationChange) {
				mapModel.centerOnNode(mapModel.getSelectedNodeId());
			} else {
				mapModel.resetView();
			}

		});
		jQuery(document).on('keydown', function (e) {
			var functions = {
				'U+003D': 'scaleUp',
				'U+002D': 'scaleDown',
				61: 'scaleUp',
				173: 'scaleDown'
			}, mappedFunction;
			if (e && !e.altKey && (e.ctrlKey || e.metaKey)) {
				if (e.originalEvent && e.originalEvent.keyIdentifier) { /* webkit */
					mappedFunction = functions[e.originalEvent.keyIdentifier];
				} else if (e.key === 'MozPrintableKey') {
					mappedFunction = functions[e.which];
				}
				if (mappedFunction) {
					if (actOnKeys) {
						e.preventDefault();
						mapModel[mappedFunction]('keyboard');
					}
				}
			}
		}).on('wheel mousewheel', function (e) {
			var scroll = e.originalEvent.deltaX || (-1 * e.originalEvent.wheelDeltaX);
			if (scroll < 0 && element.scrollLeft() === 0) {
				e.preventDefault();
			}
			if (scroll > 0 && (element[0].scrollWidth - element.width() - element.scrollLeft() === 0)) {
				e.preventDefault();
			}
		});

		element.on('keypress', function (evt) {
			if (!actOnKeys) {
				return;
			}
			if (/INPUT|TEXTAREA/.test(evt && evt.target && evt.target.tagName)) {
				return;
			}
			var unicode = evt.charCode || evt.keyCode,
				actualkey = String.fromCharCode(unicode),
				mappedFunction = charEventHandlers[actualkey];
			if (mappedFunction) {
				evt.preventDefault();
				mapModel[mappedFunction]('keyboard');
			} else if (Number(actualkey) <= 9 && Number(actualkey) >= 1) {
				evt.preventDefault();
				mapModel.activateLevel('keyboard', Number(actualkey) + 1);
			}
		});
	});
};

/**
 *MindMup API
 *@module MM
 *@main MM
 */
var MM = MM || {};


/*global MM */
MM.IOS = MM.IOS || {};
MM.IOS.Alert = function (mmProxy) {
	'use strict';
	var self = this,
	lastId = 1;
	self.show = function (message, detail, type) {
		var currentId = lastId;
		lastId += 1;
		mmProxy.sendMessage({type: 'alert:show', args: {'message': message, 'detail': detail, 'type': type, 'currentId': currentId}});
		return currentId;
	};
	self.hide = function (messageId) {
		mmProxy.sendMessage({type: 'alert:hide', args: {'messageId': messageId}});
	};
};

/*global MM*/

MM.IOS = MM.IOS || {};
MM.IOS.AutoSave = function (autoSave, confimationProxy) {
	'use strict';
	var self = this,
			discardUnsavedChanges = false;

	autoSave.addEventListener('unsavedChangesAvailable', function () {
		if (discardUnsavedChanges) {
			autoSave.discardUnsavedChanges();
			return;
		}
		confimationProxy.requestConfirmation('You have unsaved changes', {'default': 'Apply unsaved changes', 'destructive': 'Discard unsaved changes'}, 'You have made changes to this map that were not saved. Please choose if you would like to apply them or discard them and continue with the saved version').then(function (choice) {
			if (choice === 'default') {
				autoSave.applyUnsavedChanges();
			} else {
				autoSave.discardUnsavedChanges();
			}
		});
	});
	self.on = function () {
		discardUnsavedChanges = false;
	};

	self.off = function () {
		discardUnsavedChanges = true;
	};
};

/*global MM, _, jQuery*/

MM.IOS = MM.IOS || {};
MM.IOS.ConfirmationProxy = function (mmProxy) {
	'use strict';
	var self = this,
			currentId = 1,
			currentDeferred,
			confirmationId,
			validButtons = ['default', 'cancel', 'destructive'];

	self.requestConfirmation = function (title, buttons, message) {
		var deferred = jQuery.Deferred(),
				args = {'title': title, 'confirmationId': currentId},
				buttonArgs = {};

		if (!title || !title.trim()) {
			return deferred.reject('invalid-args').promise();
		}
		_.each(validButtons, function (button) {
			var title = buttons[button];
			if (title) {
				buttonArgs[button] = title;
			}
		});
		if (_.isEmpty(buttonArgs)) {
			return deferred.reject('invalid-args').promise();
		}
		if (message && message.trim()) {
			args.message = message;
		}
		_.extend(args, buttonArgs);
		mmProxy.sendMessage({'type': 'confirmation:show', 'args': args});
		currentId++;
		currentDeferred = deferred;
		confirmationId = args.confirmationId;
		return deferred.promise();
	};

	self.handlesCommand = function (command) {
		if (!command || command.type !== 'confirmation:choice' || confirmationId !== command.args[0] || !_.contains(validButtons, command.args[1])) {
			return false;
		}
		return true;
	};
	self.handleCommand = function (command) {
		if (!self.handlesCommand(command)) {
			return false;
		}
		currentDeferred.resolve(command.args[1]);
		return true;
	};
};

/*global jQuery */
jQuery.fn.iosContextMenuWidget = function (mapModel, tools) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				toolbar = element.find('[data-mm-role~="context-menu-toolbar"]'),
				toolContainer = element.find('[data-mm-role~="context-menu-tool-container"]');
		toolbar.click(function (e) {
			e.preventDefault();
			e.stopPropagation();
		});
		if (tools) {
			tools.each(function () {
				jQuery(this).clone(true).css('display', '').appendTo(toolContainer).click(function () {
					element.trigger(jQuery.Event('hidePopover'));
				});
			});
		}
		mapModel.addEventListener('contextMenuRequested', function (nodeId, x, y) {
			if (!mapModel.getEditingEnabled || mapModel.getEditingEnabled()) {
				element.trigger(jQuery.Event('showPopover', {'x': x, 'y': y}));
			}
		});
	});
};

/*global jQuery */
jQuery.fn.iosLinkEditWidget = function (mapModel) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this);
		//this.updateLinkStyle = function (source, ideaIdFrom, ideaIdTo, prop, value) {
		mapModel.addEventListener('linkSelected', function (link, selectionPoint, linkStyle) {
			element.find('[data-mm-role~="link-removal"]').data('mm-model-args', [link.ideaIdFrom, link.ideaIdTo]);
			element.find('[data-mm-role~="link-color"]').data('mm-model-args', [link.ideaIdFrom, link.ideaIdTo, 'color']);

			if (linkStyle && linkStyle.arrow) {
				element.find('[data-mm-role~="link-no-arrow"]').show().data('mm-model-args', [link.ideaIdFrom, link.ideaIdTo, 'arrow', false]);
				element.find('[data-mm-role~="link-arrow"]').hide();
			} else {
				element.find('[data-mm-role~="link-no-arrow"]').hide();
				element.find('[data-mm-role~="link-arrow"]').show().data('mm-model-args', [link.ideaIdFrom, link.ideaIdTo, 'arrow', true]);
			}
			if (linkStyle && linkStyle.lineStyle && linkStyle.lineStyle === 'dashed') {
				element.find('[data-mm-role~="link-solid"]').show().data('mm-model-args', [link.ideaIdFrom, link.ideaIdTo, 'lineStyle', 'solid']);
				element.find('[data-mm-role~="link-dashed"]').hide();
			} else {
				element.find('[data-mm-role~="link-dashed"]').show().data('mm-model-args', [link.ideaIdFrom, link.ideaIdTo, 'lineStyle', 'dashed']);
				element.find('[data-mm-role~="link-solid"]').hide();
			}
			element.trigger(jQuery.Event('showPopover', selectionPoint));
		});
	});
};

/*global MM, MAPJS, jQuery*/
MM.IOS = MM.IOS || {};
MM.IOS.MapLoadHandler = function (iosAutoSave, mapOptions, mmProxy, iosMapSource, container, activityLog, mapModel, imageInsertController, activeContentResourceManager, mapController) {
	'use strict';
	var self = this;
	self.handlesCommand = function (command) {
		if (command.type === 'loadMap') {
			return true;
		}
		return false;
	};
	self.handleCommand = function (command) {
		if (!self.handlesCommand) {
			return;
		}
		var newIdea = command.args[0],
				readonly = command.args[1],
				quickEdit = command.args[2],
				content = MAPJS.content(newIdea),
				mapId = command.args[3] || 'ios-no-autosave',
				touchEnabled = true,
				dragContainer = jQuery('#splittable');

		if (mapId === 'ios-no-autosave') {
			iosAutoSave.off();
		} else {
			iosAutoSave.on();
		}
		mapOptions.inlineEditingDisabled = quickEdit;
		mmProxy.sendMessage({type: 'map-save-option', args: {'dialog': 'not-required'}});
		content.addEventListener('changed', function () {
			mmProxy.sendMessage({type: 'map-save-option', args: {'dialog': 'show'}});
		});
		iosMapSource.setIdea(content);
		container.domMapWidget(activityLog, mapModel, touchEnabled,  imageInsertController, dragContainer, activeContentResourceManager.getResource, true, mapOptions);
		mapController.loadMap(mapId);

		if (readonly) {
			jQuery('[data-mm-role="ios-menu"]').remove();
			mapModel.setEditingEnabled(false);
		} else {
			mapModel.setEditingEnabled(true);
		}
		if (quickEdit) {

			jQuery('body').addClass('ios-quick-edit-on');
			jQuery('body').removeClass('ios-quick-edit-off');
		} else {
			jQuery('body').removeClass('ios-quick-edit-on');
			jQuery('body').addClass('ios-quick-edit-off');
		}
	};
};

/*global jQuery, MM*/
MM.IOSMapSource = function (content) {
	'use strict';
	var properties = {editable: true},
			mapContent = content;
	this.recognises = function () {
		return true;
	};
	this.setIdea = function (content) {
		mapContent = content;
	};
	this.loadMap = function (mapId) {
		return jQuery.Deferred().resolve(mapContent, mapId, properties).promise();
	};
};

/*global MM*/

MM.IOS = MM.IOS || {};
MM.IOS.MapModelProxy = function (mapModel, mmProxy, activeContentResourceManager, mapOptions) {
	'use strict';
	var self = this;

	self.handlesCommand = function (command) {
		if (command && command.type && command.type.substr && command.type.substr(0, 9) === 'mapModel:') {
			var modelCommand = self.mapModelCommandName(command);
			if (mapModel[modelCommand]) {
				return modelCommand;
			}
		}
		return false;
	};
	self.mapModelCommandName = function (command) {
		var components =  command && command.type && command.type.split && command.type.split(':');
		if (components && components.length === 2) {
			return components[1];
		}
		return false;
	};
	self.handleCommand = function (command) {
		var result,
			modelCommand;
		if (command.type === 'mapModel:setIcon') {
			result = command.args && command.args[0];
			if (result) {
				return mapModel.setIcon('icon-editor', activeContentResourceManager.storeResource(result.url), result.width, result.height, result.position);
			} else {
				return mapModel.setIcon(false);
			}
		}
		modelCommand = self.handlesCommand(command);
		if (modelCommand) {
			return mapModel[modelCommand].apply(mapModel, command.args);
		}
		return false;
	};
	mapModel.addEventListener('nodeEditRequested', function (nodeId, shouldSelectAll, editingNew) {
		if (!mapOptions || !mapOptions.inlineEditingDisabled) {
			return;
		}
		var node = mapModel.findIdeaById(nodeId),
				title = node && node.title;
		mmProxy.sendMessage({'type': 'nodeEditRequested', 'args': {'nodeId': nodeId, 'title': title, 'shouldSelectAll': shouldSelectAll, 'editingNew': editingNew}});
	});
};

/*global jQuery*/

jQuery.fn.iosMenuWidget = function (mapModel, messageSender) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				defaultMenuName = element.data('mm-default-menu'),
				toolbar = element.find('[data-mm-role="ios-toolbar"]'),
				menuTitle = element.find('[data-mm-role="ios-menu-title"]'),
				source = element.data('mm-source') || 'ios',
				defaultToggleText = menuTitle.text(),
				altToggleText = menuTitle.data('mm-toggled-text'),
				menuStack = [],
				showMenu = function (menuName, pushToStack) {
					element.find('[data-mm-menu][data-mm-menu!="' + menuName + '"]').hide();
					element.find('[data-mm-menu="' + menuName + '"]').show();
					if (pushToStack) {
						menuStack.push(menuName);
					}
					if (menuStack.length === 0) {
						menuTitle.text(altToggleText);
					} else {
						menuTitle.text('Back');
					}
				},
				goBackToMenuInStack = function () {
					menuStack.pop();
					if (menuStack.length > 0) {
						showMenu(menuStack[menuStack.length - 1]);
					} else {
						showMenu(defaultMenuName);
					}
				};

		element.find('[data-mm-menu][data-mm-menu!="' + defaultMenuName + '"]').hide();
		element.find('[data-mm-role="ios-menu-toggle"]').click(function () {
			if (!toolbar.is(':visible')) {
				menuTitle.text(altToggleText);
				toolbar.show();
			} else {
				if (menuStack.length > 0) {
					goBackToMenuInStack();
				} else {
					toolbar.hide();
					menuTitle.text(defaultToggleText);
				}
			}
		});
		element.find('[data-mm-menu-role~="showMenu"]').click(function () {
			var clickElement = jQuery(this),
					menu = clickElement.data('mm-action');
			if (menu) {
				showMenu(menu, true);
			}
		});
		element.find('[data-mm-menu-role~="modelAction"]').click(function () {
			var clickElement = jQuery(this),
					action = clickElement.data('mm-action'),
					additionalArgs = clickElement.data('mm-model-args') || [],
					args = [source].concat(additionalArgs);
			if (action && mapModel && mapModel[action]) {
				mapModel[action].apply(mapModel, args);
			}
		});
		element.find('[data-mm-menu-role~="showWidget"]').click(function () {
			var clickElement = jQuery(this),
					widgetRole = clickElement.data('mm-widget-role'),
					widget = jQuery('[data-mm-role~="' + widgetRole + '"]');
			widget.data('mm-model-args', clickElement.data('mm-model-args'));
			widget.show();
		});
		element.find('[data-mm-menu-role~="sendMessage"]').click(function () {
			var clickElement = jQuery(this),
					msg = {'type': clickElement.data('mm-message-type')},
					argsText = clickElement.data('mm-message-args');
			if (argsText) {
				msg.args = argsText.split(',');
			}
			messageSender.sendMessage(msg);
		});

	});
};

/*global jQuery*/
jQuery.fn.iosModalWidget = function () {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this);
		element.hide();
		element.find('[data-mm-role~="dismiss-modal"]').click(function () {
			element.hideModal();
		});
	});
};

jQuery.fn.showModal = function () {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				wasHidden = !element.is(':visible');
		if (wasHidden) {
			element.trigger(jQuery.Event('show'));
		}
		element.show();
		if (wasHidden) {
			element.trigger(jQuery.Event('shown'));
		}
	});
};

jQuery.fn.hideModal = function () {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				wasVisible = element.is(':visible');
		if (wasVisible) {
			element.trigger(jQuery.Event('hide'));
		}
		element.hide();
		if (wasVisible) {
			element.trigger(jQuery.Event('hidden'));
		}
	});
};


/*global jQuery*/


jQuery.fn.iosModeIndicatorWidget = function (mapModel) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this);
		mapModel.addEventListener('addLinkModeToggled', function (isOn) {
			element.find('[data-mm-role="modeIndicator"]').hide();
			if (isOn) {
				element.show();
				element.find('[data-mm-mode="addLinkMode"]').show();
			} else {
				element.hide();
			}
		});
	});
};

/*global jQuery, _*/
jQuery.fn.iosBackgroundColorWidget = function (mapModel, colors, source) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				palette = element.find('[data-mm-role="ios-color-palette"]'),
				template = element.find('[data-mm-role="ios-color-selector-template"]').detach(),
				contentContainer = element.find('[data-mm-role="ios-modal-content"]'),
				modelMethod = element.data('mm-model-method') || 'updateStyle';
		source = source || 'ios';
		element.on('hide', function () {
			contentContainer.scrollTop(0);
			return true;
		});
		_.each(colors, function (color) {
			var colorSelector = template.clone(),
					colorHash = color === 'transparent' ? '' : '#' + color,
					tansparentImage = element.find('[data-mm-role="transparent-color-image"]').attr('src');
			if (color === 'transparent') {
				colorSelector.css({'background-image': 'url(' + tansparentImage + ')', 'background-size': '100% 100%'});
			}
			colorSelector.css('background-color', colorHash);
			colorSelector.appendTo(palette).show().click(function () {
				var args = element.data('mm-model-args') || ['background'];
				mapModel[modelMethod].apply(mapModel, [source].concat(args).concat(colorHash));
				element.hideModal();
			});
		});
	});
};

/*global jQuery, window,  _ */

jQuery.fn.iosPopoverMenuWidget = function (mapModel, stageApi) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this),
				toolbar = element.find('[data-mm-role~="popover-toolbar"]'),
				topPointer = element.find('[data-mm-role="popover-pointer-top"]'),
				bottomPointer = element.find('[data-mm-role="popover-pointer-bottom"]'),
				hidePopover = function () {
					if (element.is(':visible')) {
						element.unbind('click');
						element.hide();
					}
				},
				backgroundClick = function () {
					hidePopover();
				},
				setupBackgroundClick = function (ignoreVisibility) {
					if (ignoreVisibility ||  element.is(':visible')) {
						element.click(backgroundClick);
					}
				},
				calcTopBottomHeight = function () {
					return (element.height() -  toolbar.outerHeight() + 20);
				},
				showPopover = function (evt) {
					var x = evt.x,
							y = evt.y,
							topBottomHeight = calcTopBottomHeight(),
							showAbove = (y > topBottomHeight),
							maxLeft = element.width() - toolbar.outerWidth() - 10,
							minLeft = 10,
							left = Math.max(minLeft, Math.min(maxLeft, x - (toolbar.outerWidth() / 2))),
							top = showAbove ? (y - toolbar.outerHeight() - 10) : y + 10,
							pointerMinLeft = 20,
							pointerMaxLeft = toolbar.outerWidth() - 20,
							pointerLeft = Math.max(pointerMinLeft, Math.min(pointerMaxLeft, (x - left - 10))),
							selectedNodeId = mapModel && mapModel.getCurrentlySelectedIdeaId();
					if (selectedNodeId) {
						setMenuItemsForNodeId(selectedNodeId);
					}
					if (showAbove) {
						bottomPointer.css('left', pointerLeft + 'px');
						topPointer.hide();
						bottomPointer.show();
					} else {
						topPointer.show();
						bottomPointer.hide();
						topPointer.css('left', pointerLeft + 'px');
					}
					toolbar.css({'top': Math.max(-20, top) + 'px', 'left': left + 'px'});
					//stop the click handler being added to soon or it fires immediately
					// if (!ignoreBackGroundClick) {
					if (evt.noDelay) {
						setupBackgroundClick(true);
					} else {
						window.setTimeout(setupBackgroundClick, 1000);
					}

					element.show();
				},
				setMenuItemsForNodeId = function (nodeId) {
					var context = mapModel.contextForNode(nodeId);
					_.each(context, function (val, key) {
						var selection = element.find('[data-mm-menu-role~=ios-node-context-' + key + ']');
						if (val) {
							selection.removeClass('iosDisabled');
						} else {
							selection.addClass('iosDisabled');
						}
					});
				};
		toolbar.click(function (e) {
			e.preventDefault();
			e.stopPropagation();
		});
		element.find('[data-mm-role~="popover-close"]').click(hidePopover);
		element.on('hidePopover', function () {
			hidePopover();
		});
		element.on('showPopover', showPopover);
		if (stageApi) {
			stageApi.topBottomHeight = calcTopBottomHeight();
			stageApi.addEventListener('togglePopover', function (evt) {
				if (element.is(':visible')) {
					hidePopover();
				} else {
					showPopover(_.extend({}, evt, {noDelay: true}));
				}
			});
		}
	});
};

/*global jQuery, MM, observable */
MM.IOSStageAPI = function (mapModel) {
	'use strict';
	var self = observable(this);
	self.togglePopoverMenu = function () {
		mapModel.dispatchEvent('nodeVisibilityRequested');
		var selected = jQuery('.mapjs-node.selected'),
				rect = selected && self.getRectForNode(selected),
				touchPoint = rect && self.getTouchPointForRect(rect);
		if (!touchPoint) {
			return;
		}

		selected[0].scrollIntoViewIfNeeded();
		self.dispatchEvent('togglePopover', touchPoint, true);
	};
	self.getRectForNode = function (node) {
		var stage = jQuery('[data-mapjs-role=stage]'),
				scale = stage && stage.data && stage.data('scale'),
				offset = node && node.offset && node.offset(),
				width = node && node.outerWidth && node.outerWidth(),
				height = node && node.outerHeight && node.outerHeight();
		if (!stage || !scale || !offset || !width || !height) {
			return false;
		}
		return {left: offset.left, top: offset.top, width: width * scale, height: height * scale};
	};
	self.getTouchPointForRect = function (rect) {
		var	body = jQuery('body'),
				bodyWidth = body && body.innerWidth(),
				bodyHeight = body && body.innerHeight(),
				top = bodyHeight && rect && Math.min(bodyHeight, Math.max(0, rect.top + rect.height / 2)),
				left = bodyWidth && rect && Math.min(bodyWidth, Math.max(0, rect.left + rect.width / 2));

		if (top && left) {
			return {x: left, y: top};
		}
		return false;
	};
	self.handlesCommand = function (command) {
		if (command.type && command.type.substr && command.type.substr(0, 9) === 'iosStage:') {
			return true;
		}
		return false;
	};
	self.handleCommand = function (command) {
		if (!self.handlesCommand(command)) {
			return;
		}
		var stageCommand = command.type.split(':')[1];
		if (stageCommand && self[stageCommand]) {
			self[stageCommand].apply(self, command.args);
		}
	};
};

/*global MM, jQuery, window*/

MM.IOS = MM.IOS || {};
MM.IOS.WindowProxy = function (mapModel, mmProxy, resourceCompressor) {
	'use strict';
	var self = this,
		viewTimeoutDelayMillis = 100,
		centerMapModel = function () {
			if (mapModel && mapModel.centerOnNode && mapModel.getSelectedNodeId()) {
				mapModel.centerOnNode(mapModel.getSelectedNodeId());
			}
		},
		setViewport  = function (command) {
			if (command.type !== 'setViewport') {
				return false;
			}
			var currentViewPort = jQuery('meta[name=viewport]').attr('content');
			if (currentViewPort !== command.args) {
				jQuery('meta[name=viewport]').attr('content', command.args);
				jQuery('[data-mm-role="ios-context-menu"]').add(jQuery('[data-mm-role="ios-link-editor"]')).trigger(jQuery.Event('hidePopover'));
				window.setTimeout(centerMapModel, viewTimeoutDelayMillis);
			}
			return true;
		},
		prepareForSave = function (command) {
			if (command.type !== 'prepareForSave') {
				return false;
			}

			mapModel.resetView();
			/* deprecated: old versions of the editor used this */
			jQuery('[data-mm-role="ios-menu"]').hide();
			jQuery('[data-mm-role="ios-toolbar"]').hide();
			/* end of deprecated */

			jQuery('[data-mm-role="ios-context-menu"]').trigger(jQuery.Event('hidePopover'));
			jQuery('[data-mm-role="ios-link-editor"]').trigger(jQuery.Event('hidePopover'));

			window.setTimeout(function () {
				mapModel.scaleDown();
				window.setTimeout(function () {
					var idea = mapModel.getIdea(),
							title = idea.title || 'Mindmup map',
							saveScreenOnly = command.args && command.args[0] && command.args[0] === 'save-screen-only';
					if (saveScreenOnly) {
						mmProxy.sendMessage({type: 'save-screen'});
					} else {
						resourceCompressor.compress(idea);
						mmProxy.sendMessage({type: 'save-content', args: {'title': title, 'idea': JSON.stringify(idea)}});
					}
				}, viewTimeoutDelayMillis);
			}, viewTimeoutDelayMillis);

			return true;
		};
	self.handlesCommand = function (command) {
		if (command.type === 'setViewport' || command.type === 'prepareForSave') {
			return true;
		}
		return false;
	};

	self.handleCommand = function (command) {
		if (!self.handlesCommand(command)) {
			return false;
		}
		if (setViewport(command)) {
			return;
		}
		prepareForSave(command);
	};
};

/*global window, console, MM*/
MM.IOS = MM.IOS || {};
MM.IOS.defaultMap = function () {
	'use strict';
	return {
		'title': 'double-tap this node to edit',
		'id': 1,
		'formatVersion': 2
	};
};

MM.IOS.Proxy = function (listenerName) {
	'use strict';
	var self = this,
			wkMessageHandler = (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers[listenerName]);
	if (wkMessageHandler) {
		self.sendMessage = function () {
			try {
				var args = Array.prototype.slice.call(arguments, 0);
				if (!args || args.length === 0) {
					return;
				}
				if (args.length > 1) {
					wkMessageHandler.postMessage(JSON.parse(JSON.stringify(args)));
				} else {
					wkMessageHandler.postMessage(JSON.parse(JSON.stringify(args[0])));
				}

			} catch (err) {
				//unable to send message
			}
		};
	} else {
		self.sendMessage = function () {
			console.log.apply(console, arguments);
		};
	}
	if (wkMessageHandler) {
		window.console.log = function () {
			var args = Array.prototype.slice.call(arguments, 0);
			self.sendMessage({'type': 'log', 'args': args});
		};
		window.onerror = function errorHandler() {
			try {
				var args = Array.prototype.slice.call(arguments, 0);
				self.sendMessage({'type': 'error', 'args': args});
			} catch (err) {
				//unable to send error
			}
			return false;
		};
	}
};



/*jslint nomen: true*/
/*global MM, jQuery, MAPJS, console, window, _*/
jQuery.fn.modal = function (options) {
	'use strict';
	return jQuery(this).each(function () {
		var element = jQuery(this);
		if (!options) {
			return;
		}
		if (options.show || options === 'show') {
			element.showModal();
		} else {
			element.hideModal();
		}
	});
};
MAPJS.DOMRender = MAPJS.DOMRender || {};
MAPJS.DOMRender.stageMargin = {top: 60, left: 20, bottom: 100, right: 20};
MAPJS.DOMRender.stageVisibilityMargin = {top: 20, left: 20, bottom: 20, right: 20};

MM.main = function (config) {
	'use strict';
	console.log('MM.main');
	var mmProxy = new MM.IOS.Proxy('mmproxy'),
			activityLog = new MM.ActivityLog(10000),
			setupTracking = function (activityLog, mapModel, mapModelAnalytics) {
				activityLog.addEventListener('log', function () {
					var args = Array.prototype.slice.call(arguments, 0, 3);
					mmProxy.sendMessage({type: 'analytic', args: args});
				});
				activityLog.addEventListener('error', function (message) {
					var args = ['error', message, activityLog.getLog()];
					mmProxy.sendMessage({type: 'analytic', args: args});
				});
				activityLog.addEventListener('timer', function (category, action, time) {
					var args = [category,  action, '', time];
					mmProxy.sendMessage({type: 'analytic', args: args});
				});
				if (mapModelAnalytics) {
					mapModel.addEventListener('analytic', activityLog.log);
				}
				mapModel.addEventListener('layoutChangeStarting', function () {
					var args = Array.prototype.slice.call(arguments, 0);
					mmProxy.sendMessage({'type': 'layoutChangeStarting', 'args': args});
				});
				mapModel.addEventListener('layoutChangeComplete', function () {
					var args = Array.prototype.slice.call(arguments, 0);
					mmProxy.sendMessage({'type': 'layoutChangeComplete', 'args': args});
				});
			},
			container = jQuery('#container'),
			iosMapSource = new MM.IOSMapSource(MAPJS.content(MM.IOS.defaultMap())),
			mapController = new MM.MapController([iosMapSource]),
			activeContentListener = new MM.ActiveContentListener(mapController),
			resourcePrefix = 'internal',
			resourceCompressor = new MM.ResourceCompressor(resourcePrefix),
			activeContentResourceManager = new MM.ActiveContentResourceManager(activeContentListener, resourcePrefix),
			imageInsertController = new MAPJS.ImageInsertController(config.corsProxyUrl, activeContentResourceManager.storeResource),
			alert = MM.IOS.Alert(mmProxy),
			objectStorage = new MM.JsonStorage(window.localStorage),
			objectClipboard = new MM.LocalStorageClipboard(objectStorage, 'clipboard', alert),
			mapModel = new MAPJS.MapModel(MAPJS.DOMRender.layoutCalculator, ['double-tap this node to edit'], objectClipboard),
			iosStage = new MM.IOSStageAPI(mapModel),
			iconEditor = new MM.iconEditor(mapModel, activeContentResourceManager),
			mapOptions = _.extend({}, config),
			mapModelProxy = new MM.IOS.MapModelProxy(mapModel, mmProxy, activeContentResourceManager, mapOptions),
			confimationProxy = new MM.IOS.ConfirmationProxy(mmProxy),
			autoSave = new MM.AutoSave(mapController, objectStorage, alert, mapModel),
			iosAutoSave = new MM.IOS.AutoSave(autoSave, confimationProxy),
			windowProxy = new MM.IOS.WindowProxy(mapModel, mmProxy, resourceCompressor),
			maploadHandler = new MM.IOS.MapLoadHandler(iosAutoSave, mapOptions, mmProxy, iosMapSource, container, activityLog, mapModel, imageInsertController, activeContentResourceManager, mapController),
			commandHandlers = [mapModelProxy, confimationProxy, windowProxy, iosStage, maploadHandler],
			mapModelAnalytics = false;


	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		idea.setConfiguration(config.activeContentConfiguration);
		mapModel.setIdea(idea);
		mmProxy.sendMessage({type: 'mapLoaded'});
	});
	iconEditor.addEventListener('iconEditRequested', function (icon) {
		mmProxy.sendMessage({type: 'showMessage', args: {'type': 'info', 'message': 'Loading icon editor, please wait...'}});
		icon = icon || {};
		mmProxy.sendMessage({type: 'iconEditRequested', args: icon});
	});
	setupTracking(activityLog, mapModel, mapModelAnalytics);
	MM.MapController.activityTracking(mapController, activityLog);
	jQuery('[data-mm-role~="ios-modal"]').iosModalWidget();
	jQuery('[data-mm-role~="ios-menu"]').iosMenuWidget(mapModel, mmProxy);
	jQuery('[data-mm-role="ios-context-menu"]').iosPopoverMenuWidget(mapModel, iosStage).iosContextMenuWidget(mapModel, jQuery('[data-mm-menu-role~="context-menu"]'));
	jQuery('[data-mm-role="ios-link-editor"]').iosPopoverMenuWidget().iosMenuWidget(mapModel, mmProxy).iosLinkEditWidget(mapModel);
	jQuery('[data-mm-role="mode-indicator"]').iosModeIndicatorWidget(mapModel);
	jQuery('[data-mm-role~="ios-color-picker"]').iosBackgroundColorWidget(mapModel, [
			'000000', '993300', '333300', '000080', '333399', '333333', '800000', 'FF6600',
			'808000', '008000', '008080', '0000FF', '666699', '808080', 'FF0000', 'FF9900',
			'99CC00', '339966', '33CCCC', '3366FF', '800080', '999999', 'FF00FF', 'FFCC00',
			'FFFF00', '00FF00', '00FFFF', '00CCFF', '993366', 'C0C0C0', 'FF99CC', 'FFCC99',
			'FFFF99', 'CCFFFF', 'FFFFFF', 'transparent'
		]);
	MM.command = MM.command || function (command) {
		var completed = {'completed': true, 'command': command.type},
			commandHandler = _.find(commandHandlers, function (handler) {
				return handler.handlesCommand(command);
			});
		if (commandHandler) {
			commandHandler.handleCommand(command);
			return completed;
		} else if (command.type === 'ping') {
			mmProxy.sendMessage(command);
		} else if (command.type === 'contentSaved') {
			autoSave.discardUnsavedChanges();
		} else if (command.type === 'keyboardShown') {
			jQuery('body').addClass('ios-keyboardShown');
		} else if (command.type === 'keyboardHidden') {
			jQuery('body').removeClass('ios-keyboardShown');
		} else if (command.type === 'mapModel' && command.args && command.args.length > 0) {
			mapModel[command.args[0]].apply(mapModel, command.args.slice(1));
		}
		return completed;
	};
	mmProxy.sendMessage({type: 'loadComplete'});
};

/*global jQuery, MM, observable*/
/**
 * Utility logging class that can dispatch events. Used by other classes
 * as a central tracking and analytics mechanism. Caches a list of most
 * recent events in memory for troubleshooting purposes.
 *
 * @class ActivityLog
 * @constructor
 * @param {int} maxNumberOfElements the maximum number of elements to keep in memory
 */
MM.ActivityLog = function (maxNumberOfElements) {
	'use strict';
	var activityLog = [], nextId = 1, self = this;
	observable(this);
    /**
     * Tracks an event and dispatches a **log** event to all observers.
     *
     * @method log
     * @param {String} ...args a list of arguments to log. By convention, the first argument is a category, the second is an action, the others are arbitrary strings
     */
	this.log = function () {
		var analyticArgs = ['log'];
		if (activityLog.length === maxNumberOfElements) {
			activityLog.shift();
		}
		activityLog.push({
			id: nextId,
			ts: new Date(),
			event: Array.prototype.join.call(arguments, ',')
		});
		nextId += 1;
		Array.prototype.slice.call(arguments).forEach(function (element) {
			if (jQuery.isArray(element)) {
				analyticArgs = analyticArgs.concat(element);
			} else {
				analyticArgs.push(element);
			}
		});
		self.dispatchEvent.apply(self, analyticArgs);
	};
    /**
     * Shorthand error logging method, it will call log with an Error category and dispatch a separate **error** event
     * @method error
     */
	this.error = function (message) {
		self.log('Error', message);
		self.dispatchEvent('error', message, activityLog);
	};
    /**
     * Utility method to look at the list of most recent events
     *
     * @method getLog
     * @return the list of most recent events
     */
	this.getLog = activityLog.slice.bind(activityLog);
    /**
     * Starts an asynchronous timer - can be stopped at a later point.
     * @method timer
     * @param {String} category the category to log
     * @param {String} action the action to log
     * @return javascript object with an **end** method, which will stop the timer and log the total number of milliseconds taken since start
     */
	this.timer = function (category, action) {
		var start = Date.now();
		return {
			end: function () {
				self.dispatchEvent('timer', category, action, Date.now() - start);
			}
		};
	};
};
jQuery.fn.trackingWidget = function (activityLog) {
	'use strict';
	return this.each(function () {
		var element = jQuery(this),
			category = element.data('category'),
			eventType = element.data('event-type') || '',
			label = element.data('label') || '';
		element.click(function () {
			activityLog.log(category, eventType, label);
		});
	});
};

/*global jQuery, MAPJS, MM, observable */

MM.iconEditor = function (mapModel, resourceManager) {
	'use strict';
	observable(this);
	var currentDeferred,
		self = this;
	this.editIcon = function (icon) {
		if (icon) {
			icon.url = resourceManager.getResource(icon.url);
		}
		currentDeferred = jQuery.Deferred();
		this.dispatchEvent('iconEditRequested', icon);
		return currentDeferred.promise();
	};
	this.save = function (icon) {
		currentDeferred.resolve(icon);
	};
	this.cancel = function () {
		currentDeferred.reject();
	};

	mapModel.addEventListener('nodeIconEditRequested', function () {
		var icon = mapModel.getIcon();
		self.editIcon(icon).then(function (result) {
			if (result) {
				mapModel.setIcon('icon-editor', resourceManager.storeResource(result.url), result.width, result.height, result.position);
			} else {
				mapModel.setIcon(false);
			}
		});
	});

};
jQuery.fn.iconEditorWidget = function (iconEditor, corsProxyUrl) {
	'use strict';
	var self = this,
		confirmElement = self.find('[data-mm-role~=confirm]'),
		sizeSelect = self.find('form select[name=size]'),
		customSizeBox = self.find('[data-mm-role=custom-size-enter]'),
		imgPreview = self.find('[data-mm-role=img-preview]'),
		clearButton = self.find('[data-mm-role~=clear]'),
		positionSelect = self.find('select[name=position]'),
		widthBox = self.find('input[name=width]'),
		heightBox = self.find('input[name=height]'),
		ratioBox = self.find('input[name=keepratio]'),
		fileUpload = self.find('input[name=selectfile]'),
		dropZone = self.find('[data-mm-role=drop-zone]'),
		selectFile = self.find('[data-mm-role=select-file]'),
		doConfirm = function () {
			iconEditor.save({
				url: imgPreview.attr('src'),
				width: Math.round(widthBox.val()),
				height: Math.round(heightBox.val()),
				position: positionSelect.val()
			});
		},
		doClear = function () {
			iconEditor.save(false);
		},
		loadForm = function (icon) {
			if (!icon) {
				imgPreview.hide();
				self.find('[data-mm-role=attribs]').hide();
				clearButton.hide();
				confirmElement.hide();
			} else {
				imgPreview.show();
				imgPreview.attr('src', icon.url);
				self.find('[data-mm-role=attribs]').show();
				positionSelect.val(icon.position);
				widthBox.val(icon.width);
				heightBox.val(icon.height);
				fileUpload.val('');
				clearButton.show();
				confirmElement.show();
			}
		},
		openFile = function () {
			fileUpload.click();
		},
		insertController = new MAPJS.ImageInsertController(corsProxyUrl);
	selectFile.click(openFile).keydown('space enter', openFile);
	insertController.addEventListener('imageInserted',
		function (dataUrl, imgWidth, imgHeight) {
			imgPreview.attr('src', dataUrl);
			widthBox.val(imgWidth);
			heightBox.val(imgHeight);
			self.find('[data-mm-role=attribs]').show();
			imgPreview.show();
			confirmElement.show();
			confirmElement.focus();
		}
	);
	dropZone.imageDropWidget(insertController);
	widthBox.on('change', function () {
		if (ratioBox[0].checked) {
			heightBox.val(Math.round(imgPreview.height() * parseInt(widthBox.val(), 10) / imgPreview.width()));
		}
	});
	heightBox.on('change', function () {
		if (ratioBox[0].checked) {
			widthBox.val(Math.round(imgPreview.width() * parseInt(heightBox.val(), 10) / imgPreview.height()));
		}
	});
	fileUpload.on('change', function (e) {
		insertController.insertFiles(this.files, e);
	});
	self.modal({keyboard: true, show: false});
	confirmElement.click(function () {
		doConfirm();
	}).keydown('space', function () {
		doConfirm();
		self.modal('hide');
	});
	clearButton.click(function () {
		doClear();
	}).keydown('space', function () {
		doClear();
		self.modal('hide');
	});
	sizeSelect.on('change', function () {
		if (sizeSelect.val() === 'custom') {
			customSizeBox.show();
		} else {
			customSizeBox.hide();
		}
	});
	this.on('show', function () {
		fileUpload.css('opacity', 0).val('');
	});
	this.on('shown', function () {
		fileUpload.css('opacity', 0).css('position', 'absolute')
			.offset(dropZone.offset()).width(dropZone.outerWidth()).height(dropZone.outerHeight());
		selectFile.focus();
	});
	iconEditor.addEventListener('iconEditRequested', function (icon) {
		loadForm(icon);
		self.modal('show');
	});
	return this;
};

/*global MM */
MM.ActiveContentResourceManager = function (activeContentListener, prefixTemplate) {
	'use strict';
	var self = this,
		prefix = prefixTemplate + ':',
		prefixMatcher = new RegExp('^' + prefix);
	self.storeResource = function (resourceURL) {
		return prefix + activeContentListener.getActiveContent().storeResource(resourceURL);
	};
	self.getResource = function (resourceURL) {
		if (prefixMatcher.test(resourceURL)) {
			return activeContentListener.getActiveContent().getResource(resourceURL.substring(prefix.length));
		} else {
			return resourceURL;
		}
	};
};

/*global MM, observable*/

MM.ActiveContentListener = function (mapController) {
	'use strict';
	var self = observable(this),
		activeContent,
		onChanged = function (method, attrs) {
			self.dispatchEvent('mm-active-content-changed', activeContent, false, method, attrs);
		},
		onMapLoaded = function (newMapId, content) {
			if (activeContent) {
				activeContent.removeEventListener('changed', onChanged);
			}
			activeContent = content;
			self.dispatchEvent('mm-active-content-changed', activeContent, true);
			activeContent.addEventListener('changed', onChanged);
		};
	mapController.addEventListener('mapLoaded', onMapLoaded, 999);
	self.getActiveContent = function () {
		return activeContent;
	};
	self.addListener = function (onActiveContentChanged) {
		if (activeContent) {
			onActiveContentChanged(activeContent, false);
		}
		self.addEventListener('mm-active-content-changed', onActiveContentChanged);

	};
};

/*global MM, _ */
MM.ResourceCompressor = function (prefixTemplate) {
	'use strict';
	var self = this,
		prefix = prefixTemplate + ':',
		prefixMatcher = new RegExp('^' + prefix),
		cleanUpResources = function (contentAggregate) {
			if (!contentAggregate.resources) {
				return;
			}
			var unused = {};
			_.map(contentAggregate.resources, function (value, key) {
				unused[key] = true;
			});
			contentAggregate.traverse(function (idea) {
				var url = idea && idea.attr && idea.attr.icon && idea.attr.icon.url;
				if (url) {
					delete unused[url.substring(prefix.length)];
				}
			});
			_.each(unused, function (value, key) {
				delete contentAggregate.resources[key];
			});
		},
		replaceInlineWithResources = function (contentAggregate) {
			contentAggregate.traverse(function (idea) {
				var url = idea && idea.attr && idea.attr.icon && idea.attr.icon.url;
				if (url && !prefixMatcher.test(url)) {
					idea.attr.icon.url = prefix + contentAggregate.storeResource(url);
				}
			});
		};
	self.compress = function (contentAggregate) {
		replaceInlineWithResources(contentAggregate);
		cleanUpResources(contentAggregate);
	};
};

/*global jQuery, MM, observable, XMLHttpRequest*/
MM.MapController = function (initialMapSources) {
	// order of mapSources is important, the first mapSource is default
	'use strict';
	observable(this);
	var self = this,
		dispatchEvent = this.dispatchEvent,
		mapLoadingConfirmationRequired,
		mapInfo = {},
		activeMapSource,
		mapSources = [].concat(initialMapSources),
		lastProperties,
		chooseMapSource = function (identifier) {
			// order of identifiers is important, the first identifier takes precedence
			var mapSourceIndex;
			for (mapSourceIndex = 0; mapSourceIndex < mapSources.length; mapSourceIndex++) {
				if (mapSources[mapSourceIndex].recognises(identifier)) {
					return mapSources[mapSourceIndex];
				}
			}
		},
		mapLoaded = function (idea, mapId, properties) {
			lastProperties = properties;
			mapLoadingConfirmationRequired = false;
			properties = properties || {};
			if (!properties.autoSave) {
				idea.addEventListener('changed', function () {
					mapLoadingConfirmationRequired = true;
				});
			}
			mapInfo = {
				idea: idea,
				mapId: properties.editable && mapId
			};
			dispatchEvent('mapLoaded', mapId, idea, properties);
		};
	self.addMapSource = function (mapSource) {
		mapSources.push(mapSource);
	};
	self.validMapSourcePrefixesForSaving = 'abgp';
	self.setMap = mapLoaded;
	self.isMapLoadingConfirmationRequired = function () {
		return mapLoadingConfirmationRequired;
	};

	self.currentMapId = function () {
		return mapInfo && mapInfo.mapId;
	};

	self.loadMap = function (mapId, force) {
		var progressEvent = function (evt) {
				var done = (evt && evt.loaded) || 0,
					total = (evt && evt.total) || 1,
					message = ((evt && evt.loaded) ? Math.round(100 * done / total) + '%' : evt);
				dispatchEvent('mapLoading', mapId, message);
			},
			mapLoadFailed = function (reason, label) {
				var retryWithDialog = function () {
					dispatchEvent('mapLoading', mapId);
					activeMapSource.loadMap(mapId, true).then(mapLoaded, mapLoadFailed, progressEvent);
				}, mapSourceName = activeMapSource.description ? ' [' + activeMapSource.description + ']' : '';
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapLoadingUnAuthorized', mapId, reason);
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', activeMapSource.description, retryWithDialog);
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', activeMapSource.description, retryWithDialog);
				} else if (reason === 'map-load-redirect') {
					self.loadMap(label, force);
				} else if (reason === 'user-cancel') {
					dispatchEvent('mapLoadingCancelled');
				} else {
					label = label ? label + mapSourceName : mapSourceName;
					dispatchEvent('mapLoadingFailed', mapId, reason, label);
				}
			};

		if (mapId === this.currentMapId() && !force) {
			dispatchEvent('mapLoadingCancelled', mapId);
			return;
		}
		if (!force && mapLoadingConfirmationRequired) {
			dispatchEvent('mapLoadingConfirmationRequired', mapId);
			return;
		}
		activeMapSource = chooseMapSource(mapId);
		if (!activeMapSource) {
			dispatchEvent('mapIdNotRecognised', mapId);
			return;
		}
		dispatchEvent('mapLoading', mapId);
		activeMapSource.loadMap(mapId).then(
			mapLoaded,
			mapLoadFailed,
			progressEvent
		);
	};
	this.publishMap = function (mapSourceType, forceNew) {
		var mapSaved = function (savedMapId, properties) {
				var previousWasReloadOnSave = lastProperties && lastProperties.reloadOnSave;
				properties = properties || {};
				lastProperties = properties;
				mapLoadingConfirmationRequired = false;
				mapInfo.mapId = savedMapId;
				dispatchEvent('mapSaved', savedMapId, mapInfo.idea, properties);
				if (previousWasReloadOnSave || properties.reloadOnSave) {
					self.loadMap(savedMapId, true);
				}
			},
			progressEvent = function (evt) {
				var done = (evt && evt.loaded) || 0,
					total = (evt && evt.total) || 1,
					message = ((evt && evt.loaded) ? Math.round(100 * done / total) + '%' : evt);
				dispatchEvent('mapSaving', activeMapSource.description, message);
			},
			mapSaveFailed = function (reason, label) {
				var retryWithDialog = function () {
					dispatchEvent('mapSaving', activeMapSource.description);
					activeMapSource.saveMap(mapInfo.idea, mapInfo.mapId, true).then(mapSaved, mapSaveFailed, progressEvent);
				}, mapSourceName = activeMapSource.description || '';
				label = label ? label + mapSourceName : mapSourceName;
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapSavingUnAuthorized', function () {
						dispatchEvent('mapSaving', activeMapSource.description, 'Creating a new file');
						activeMapSource.saveMap(mapInfo.idea, 'new', true).then(mapSaved, mapSaveFailed, progressEvent);
					});
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', label, retryWithDialog);
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', label, retryWithDialog);
				} else if (reason === 'file-too-large') {
					dispatchEvent('mapSavingTooLarge', activeMapSource.description);
				} else if (reason === 'user-cancel') {
					dispatchEvent('mapSavingCancelled');
				} else {
					dispatchEvent('mapSavingFailed', reason, label);
				}
			},
			saveAsId = forceNew ? '' : mapInfo.mapId;
		activeMapSource = chooseMapSource(mapSourceType || mapInfo.mapId);
		dispatchEvent('mapSaving', activeMapSource.description);
		activeMapSource.saveMap(mapInfo.idea, saveAsId).then(
			mapSaved,
			mapSaveFailed,
			progressEvent
		);
	};
};
MM.MapController.activityTracking = function (mapController, activityLog) {
	'use strict';
	var startedFromNew = function (idea) {
			return idea.id === 1;
		},
		isNodeRelevant = function (ideaNode) {
			return ideaNode.title && ideaNode.title.search(/MindMup|Lancelot|cunning|brilliant|Press Space|famous|Luke|daddy/) === -1;
		},
		isNodeIrrelevant = function (ideaNode) {
			return !isNodeRelevant(ideaNode);
		},
		isMapRelevant = function (idea) {
			return startedFromNew(idea) && idea.find(isNodeRelevant).length > 5 && idea.find(isNodeIrrelevant).length < 3;
		},
		wasRelevantOnLoad,
		changed = false,
		oldIdea;
	mapController.addEventListener('mapLoaded', function (mapId, idea) {
		activityLog.log('Map', 'View', mapId);
		wasRelevantOnLoad = isMapRelevant(idea);
		if (oldIdea !== idea) {
			oldIdea = idea;
			idea.addEventListener('changed', function (command, args) {
				if (!changed) {
					changed = true;
					activityLog.log('Map', 'Edit');
				}
				activityLog.log(['Map', command].concat(args));
			});
		}
	});
	mapController.addEventListener('mapLoadingFailed', function (mapUrl, reason, label) {
		var message = 'Error loading map document [' + mapUrl + '] ' + JSON.stringify(reason);
		if (label) {
			message = message + ' label [' + label + ']';
		}
		activityLog.error(message);
	});
	mapController.addEventListener('mapSaving', activityLog.log.bind(activityLog, 'Map', 'Save Attempted'));
	mapController.addEventListener('mapSaved', function (id, idea) {
		changed = false;
		if (isMapRelevant(idea) && !wasRelevantOnLoad) {
			activityLog.log('Map', 'Created Relevant', id);
		} else if (wasRelevantOnLoad) {
			activityLog.log('Map', 'Saved Relevant', id);
		} else {
			activityLog.log('Map', 'Saved Irrelevant', id);
		}
	});
	mapController.addEventListener('mapSavingFailed', function (reason, repositoryName) {
		activityLog.error('Map save failed (' + repositoryName + ')' + JSON.stringify(reason));
	});
	mapController.addEventListener('networkError', function (reason) {
		activityLog.log('Map', 'networkError', JSON.stringify(reason));
	});
};
MM.MapController.alerts = function (mapController, alert, modalConfirmation) {
	'use strict';
	var alertId,
		showAlertWithCallBack = function (message, prompt, callback, cancel) {
			alert.hide(alertId);
			modalConfirmation.showModalToConfirm('Please confirm', message, prompt).then(callback, cancel);
		},
		showErrorAlert = function (title, message) {
			alert.hide(alertId);
			alertId = alert.show(title, message, 'error');
		};

	mapController.addEventListener('mapLoadingConfirmationRequired', function (newMapId) {
		var isNew = /^new/.test(newMapId);
		showAlertWithCallBack(
			'There are unsaved changes in the current map. Please confirm that you would like to ' + (isNew ? 'create a new map' : 'load a different map.'),
			(isNew ? 'Create New' : 'Load anyway'),
			function () {
				mapController.loadMap(newMapId, true);
			}
		);
	});
	mapController.addEventListener('mapLoading', function (mapUrl, progressMessage) {
		alert.hide(alertId);
		alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, loading the map...', (progressMessage || ''));
	});
	mapController.addEventListener('mapSaving', function (repositoryName, progressMessage) {
		alert.hide(alertId);
		alertId = alert.show('<i class="icon-spinner icon-spin"></i>&nbsp;Please wait, saving the map...', (progressMessage || ''));
	});
	mapController.addEventListener('authRequired', function (providerName, authCallback) {
		showAlertWithCallBack(
			'This operation requires authentication through ' + providerName + ', an external storage provider. ' +
				'Please click on Authenticate below to go to the external provider and allow MindMup to access your account. ' +
				'You can learn more about authentication requirements on our <a href="http://blog.mindmup.com/p/storage-options.html" target="_blank">Storage Options</a> page.',
			'Authenticate',
			authCallback
		);
	});
	mapController.addEventListener('mapSaved mapLoaded', function () {
		alert.hide(alertId);
	});
	mapController.addEventListener('authorisationFailed', function (providerName, authCallback) {
		showAlertWithCallBack(
			'The operation was rejected by ' + providerName + ' storage. Click on Reauthenticate to try using different credentials or license.',
			'Reauthenticate',
			authCallback
		);
	});
	mapController.addEventListener('mapLoadingUnAuthorized', function () {
		showErrorAlert('The map could not be loaded.', 'You do not have the right to view this map. <a target="_blank" href="http://blog.mindmup.com/p/how-to-resolve-common-networking.html">Click here for some common solutions</a>');
	});
	mapController.addEventListener('mapSavingUnAuthorized', function (callback) {
		showAlertWithCallBack(
			'You do not have the right to edit this map',
			'Save a copy',
			callback
		);
	});
	mapController.addEventListener('mapLoadingFailed', function (mapId, reason, label) {
		showErrorAlert('Unfortunately, there was a problem loading the map.' + label, 'If you are not experiencing network problems, <a href="http://blog.mindmup.com/p/how-to-resolve-common-networking.html" target="blank">click here for some common ways to fix this</a>');
	});
	mapController.addEventListener('mapSavingCancelled mapLoadingCancelled', function () {
		alert.hide(alertId);
	});
	mapController.addEventListener('mapSavingTooLarge', function (mapSourceDescription) {
		if (mapSourceDescription === 'S3_CORS') {
			showAlertWithCallBack('The map is too large for anonymous MindMup storage. Maps larger than 100 KB can only be stored to MindMup Gold, or a third-party cloud storage. (<a href="http://blog.mindmup.com/p/storage-options.html" target="_blank">more info on storage options</a>)', 'Save to MindMup Gold', function () {
				mapController.publishMap('b');
			}, function () {
				mapController.dispatchEvent('mapSavingCancelled');
			});
		} else {
			showErrorAlert('Unfortunately, the file is too large for the selected storage.', 'Please select a different storage provider from File -&gt; Save As menu');
		}
	});
	mapController.addEventListener('mapSavingFailed', function (reason, label, callback) {
		var messages = {
			'network-error': ['There was a network problem communicating with the server.', 'If you are not experiencing network problems, <a href="http://blog.mindmup.com/p/how-to-resolve-common-networking.html" target="blank">click here for some common ways to fix this</a>. Don\'t worry, you have an auto-saved version in this browser profile that will be loaded the next time you open the map']
		},
			message = messages[reason] || ['Unfortunately, there was a problem saving the map.', 'Please try again later. We have sent an error report and we will look into this as soon as possible'];
		if (callback) {
			showAlertWithCallBack(message[0], message[1], callback);
		} else {
			showErrorAlert(message[0], message[1]);
		}
	});


};
(function () {
	'use strict';
	var oldXHR = jQuery.ajaxSettings.xhr.bind(jQuery.ajaxSettings);
	jQuery.ajaxSettings.xhr = function () {
		var xhr = oldXHR();
		if (xhr instanceof XMLHttpRequest) {
			xhr.addEventListener('progress', this.progress, false);
		}
		if (xhr.upload) {
			xhr.upload.addEventListener('progress', this.progress, false);
		}
		return xhr;
	};
}());

/*global MM, observable*/
MM.AutoSave = function (mapController, storage, alertDispatcher, mapModel, clipboardKey) {
	'use strict';
	var prefix = 'auto-save-',
		self = this,
		currentMapId,
		currentIdea,
		changeListener,
		resourceListener,
		events = [],
		warningId,
		checkForLocalChanges = function (mapId) {
			var value = storage.getItem(prefix + mapId);
			if (value) {
				self.dispatchEvent('unsavedChangesAvailable', mapId);
			}
		},
		pushEvent = function (eventObject, mapId) {
			var autoSaveKey = prefix + mapId,
					saveEvents = function () {
						try {
							storage.setItem(autoSaveKey, events);
							return true;
						} catch (e) {
							return false;
						}
					},
					showWarning = function () {
						if (warningId) {
							return;
						}
						warningId = alertDispatcher.show('Unable to back up unsaved changes!', 'Please save this map as soon as possible to avoid losing unsaved information.', 'warning');
					};
			events.push(eventObject);
			if (!saveEvents()) {

				if (storage.removeKeysWithPrefix(prefix) + storage.removeKeysWithPrefix(clipboardKey) === 0) {
					showWarning();
				} else if (!saveEvents()) {
					showWarning();
				}
			}
		},
		trackChanges = function (idea, mapId) {
			events = [];
			changeListener = function (command, params) {
				pushEvent({cmd: command, args: params}, mapId);
			};
			resourceListener = function (resourceBody, resourceId) {
				pushEvent({cmd: 'storeResource', args: [resourceBody, resourceId]}, mapId);
			};
			idea.addEventListener('changed', changeListener);
			idea.addEventListener('resourceStored', resourceListener);
		},
		clearWarning = function () {
			if (warningId) {
				alertDispatcher.hide(warningId);
			}
			warningId = undefined;
		},
		onTrackingChange = function (mapId, idea, properties) {
			if (changeListener && currentIdea) {
				currentIdea.removeEventListener('changed', changeListener);
				currentIdea.removeEventListener('resourceStored', resourceListener);
			}

			if (mapId && (!properties || !properties.autoSave)) {
				currentMapId = mapId;
				currentIdea = idea;
				clearWarning();
				checkForLocalChanges(mapId);
				trackChanges(idea, mapId);
			}
		};
	observable(this);
	clipboardKey = clipboardKey || 'clipboard';
	self.applyUnsavedChanges = function () {
		var events = storage.getItem(prefix + currentMapId);
		if (events) {
			mapModel.pause();
			events.forEach(function (event) {
				currentIdea.execCommand(event.cmd, event.args);
			});
			mapModel.resume();
		}
	};
	self.discardUnsavedChanges = function () {
		events = [];
		storage.remove(prefix + currentMapId);
	};
	mapController.addEventListener('mapSaved', function (mapId, idea) {
		clearWarning();
		if (mapId === currentMapId || idea === currentIdea) {
			self.discardUnsavedChanges();
		}
		if (mapId !== currentMapId) {
			onTrackingChange(mapId, idea);
		}
	});
	mapController.addEventListener('mapLoaded', onTrackingChange);
};



/*global MM, _*/
/**
 * A simple wrapper that allows objects to be stored as JSON strings in a HTML5 storage. It
 * automatically applies JSON.stringify and JSON.parse when storing and retrieving objects
 *
 * @class JsonStorage
 * @constructor
 * @param {Object} storage object implementing the following API (for example a HTML5 localStorage)
 * @param {function} storage.setItem function(String key, String value)
 * @param {function} storage.getItem function(String key)
 * @param {function} storage.removeItem function(String key)
 */
MM.JsonStorage = function (storage) {
	'use strict';
	var self = this;
	/**
	 * Store an object under a key
	 * @method setItem
	 * @param {String} key the storage key
	 * @param {Object} value an object to be stored, has to be JSON serializable
	 */
	self.setItem = function (key, value) {
		return storage.setItem(key, JSON.stringify(value));
	};
	/**
	 * Get an item from storage
	 * @method getItem
	 * @param {String} key the storage key used to save the object
	 * @return {Object} a JSON-parsed object from storage
	 */
	self.getItem = function (key) {
		var item = storage.getItem(key);
		try {
			return JSON.parse(item);
		} catch (e) {
		}
	};
	/**
	 * Remove an object from storage
	 * @method remove
	 * @param {String} key the storage key used to save the object
	 */
	self.remove = function (key) {
		storage.removeItem(key);
	};

	self.removeKeysWithPrefix = function (prefixToMatch) {
		if (_.isEmpty(prefixToMatch)) {
			return 0;
		}
		var keysToMatch = Object.keys(storage),
			keysToRemove = _.filter(keysToMatch, function (key) {
				return key.indexOf(prefixToMatch) === 0;
			});
		_.each(keysToRemove, function (key) {
			storage.removeItem(key);
		});
		return keysToRemove.length;
	};
};

/*global MM, jQuery, _, MAPJS*/
MM.LocalStorageClipboard = function (storage, key, alertController) {
	'use strict';
	var self = this;
	self.get = function () {
		return storage.getItem(key);
	};
	self.put = function (c) {
		try {
			storage.setItem(key, c);
		} catch (e) {
			alertController.show('Clipboard error', 'Insufficient space to copy object - saving the map might help up free up space', 'error');
		}
	};
};
jQuery.fn.newFromClipboardWidget = function (clipboard, mapController) {
	'use strict';
	var elements = jQuery(this);
	elements.click(function () {
		var map = clipboard.get(),
			content;
		if (!map) {
			return;
		}
		if (_.isArray(map) && map.length > 1) {
			content = MAPJS.content(JSON.parse(JSON.stringify(MM.Maps.default)));
			content.pasteMultiple(1, map);
		} else {
			if (_.isArray(map)) {
				map = map[0];
			}
			if (map.attr && map.attr.style) {
				map.attr.style = undefined;
			}
			content = MAPJS.content(map);
		}
		mapController.setMap(content);
	});
	return elements;
};
