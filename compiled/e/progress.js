/*global MM, _, observable, jQuery, $, window*/

MM.Progress = {
	Projections: {}
};

MM.CalcModel = function (calc, activityLog) {
	'use strict';
	var self = observable(this),
		oldAddEventListener = self.addEventListener,
		activeContent,
		activeFilter,
		currentData,
		projectionNames,
		activeProjectionName,
		aggregation = calc.dataAdapter,
		logProjection = function () {
			activityLog.log('CalcModel', 'Projection:' + activeProjectionName);
		},
		projectionByName = function (name) {
			return _.find(calc.getProjectionsFor(activeContent), function (projection) {
				return projection.name === name;
			});
		},
		recalcAndPublish = function () {
			if (activeProjectionName && self.listeners('dataUpdated').length > 0) {
				currentData = aggregation(activeContent, activeFilter);
				self.dispatchEvent('dataUpdated', projectionByName(activeProjectionName).iterator(currentData), activeFilter);
			}
		};
	self.addEventListener = function (event, listener) {
		if (activeContent && event === 'dataUpdated' && self.listeners('dataUpdated').length === 0) {
			currentData = aggregation(activeContent, activeFilter);
			logProjection();
		}
		oldAddEventListener(event, listener);
		if (activeContent && event === 'dataUpdated') {
			listener.apply(undefined, [projectionByName(activeProjectionName).iterator(currentData), activeFilter]);
		}
	};
	self.setFilter = function (newFilter) {
		if (_.isEqual(newFilter, activeFilter)) {
			return;
		}
		activeFilter = newFilter;
		recalcAndPublish();
	};
	self.getFilter = function () {
		return activeFilter;
	};
	self.getActiveProjection = function () {
		return activeProjectionName;
	};
	self.dataUpdated = function (content) {
		activeContent = content;
		var newProjectionNames =  _.map(calc.getProjectionsFor(activeContent), function (projection) {
			return projection.name;
		});
		if (!_.isEqual(newProjectionNames, projectionNames)) {
			projectionNames = newProjectionNames;
			self.dispatchEvent('projectionsChanged', projectionNames);
		}
		if (!_.include(projectionNames, activeProjectionName)) {
			activeProjectionName = _.first(projectionNames);
		}
		recalcAndPublish();
	};
	self.setActiveProjection = function (name) {
		if (activeProjectionName === name) {
			return;
		}

		if (projectionByName(name)) {
			activeProjectionName = name;
			logProjection();
			recalcAndPublish();
		}
	};
	self.getFilterPredicate = function () {
		var data = _.map(currentData || aggregation(activeContent, activeFilter), function (item) {
			return item.id;
		});
		return function (idea) {
			return _.include(data, idea.id);
		};
	};
};

$.fn.calcWidget = function (calcModel, measureModel) {
	'use strict';
	return this.each(function () {
		var self = jQuery(this),
			table = self.find('[data-mm-role=calc-table]'),
			msgDiv = self.find('[data-mm-role=empty]'),
			totalElement = self.find('[data-mm-role=total]'),
			totalValueElement = totalElement.find('[data-mm-role=total-value]'),
			template = self.find('[data-mm-role=projection-template]').detach().data('mm-role', 'projection'),
			calcRowTemplate = table.find('[data-mm-role=row-template]').detach().data('mm-role', 'data-row'),
			cellTemplate = calcRowTemplate.find('[data-mm-role=cell]').detach(),
			measurements = self.find('[data-mm-role=open-measurements]'),
			repopulateTable = function (data) {
				showActiveProjection();
				table.empty();
				if (_.isEmpty(data)) {
					table.hide();
					totalElement.hide();
					msgDiv.show();
					measurements.attr('disabled', true);
				} else {
					table.show();
					msgDiv.hide();
					measurements.attr('disabled', false);
					if (data.total) {
						totalValueElement.text(data.total().toLocaleString());
						totalElement.show();
					} else {
						totalElement.hide();
					}
					_.each(data, function (row) {
						var rowDOM = calcRowTemplate.clone().appendTo(table);
						_.each(row, function (cell, index) {
							var cellDOM;
							cellDOM = cellTemplate.clone().addClass('cell' + index).appendTo(rowDOM);
							cellDOM.find('[data-mm-role=value]').text(cell.toLocaleString());
						});
					});
				}
			},
			id = self.attr('id'),
			toggleButtons = jQuery('[data-mm-role=toggle-widget][data-mm-calc-id='  + id + ']'),
			setWidgetVisible = function (visible) {
				if (visible) {
					calcModel.addEventListener('dataUpdated', repopulateTable);
					self.show();
				} else {
					calcModel.removeEventListener('dataUpdated', repopulateTable);
					self.hide();
				}
			},
			setProjections = function (projections) {
				var projectionsContainer = self.find('[data-mm-role=projections]');
				projectionsContainer.find('li').remove(0);
				_.each(projections, function (projection) {
					var item = template.clone().appendTo(projectionsContainer);
					item.find('[data-mm-role=projection-name]').text(projection).click(function () {
						calcModel.setActiveProjection(projection);
					});
				});
			},
			showActiveProjection = function () {
				self.find('[data-mm-role=active-projection]').text(calcModel.getActiveProjection());
			},
			openInMeasurements = function () {
				measureModel.editWithFilter(calcModel.getFilterPredicate());
			};
		if (table.length === 0) {
			throw ('Calc table not found, cannot initialise widget');
		}
		setWidgetVisible(false);
		//setProjections();
		calcModel.addEventListener('projectionsChanged', setProjections);
		toggleButtons.click(function () {
			setWidgetVisible(!self.is(':visible'));
		});
		measurements.click(openInMeasurements);
	});
};
MM.Progress.Calc = function (statusAttributeName, statusConfigAttr, measurementAttributeName, measurementConfigurationAttributeName, mapModel) {
	'use strict';
	var self = this,
		getConfig = function (activeContent) {
			return activeContent && activeContent.attr && activeContent.attr[statusConfigAttr] || {};
		},
		getMeasurementConfig = function (activeContent) {
			return activeContent && activeContent.attr && activeContent.attr[measurementConfigurationAttributeName] || [];
		};

	self.getProjectionsFor = function (activeContent) {
		var projections = [],
			statusConfig = getConfig(activeContent),
			dataTotaliser = function () {
				return _.reduce(this, function (val, row) {
					return val + row[1];
				}, 0);
			},
			buildPercentProjection = function (name, wrappedProjection) {
				return {name: name, iterator: function (originalData, activeContent) {
					var data = wrappedProjection(originalData, activeContent),
						total = _.reduce(data, function (valueSoFar, item) {
							return valueSoFar + item[1];
						}, 0);
					if (total === 0) {
						return [];
					}
					return _.map(data, function (item) {
						var percent = (100 * item[1] / total).toFixed(0) + '%';
						return [item[0], percent];
					});
				}};
			},
			buildSumByStatusProjection = function (name, itemValue) {
				return {name: name, iterator: function (data) {
					var rawCounts = function () {
							var currentCounts = {};
							_.each(data, function (element) {
								var val = 1,
									current = currentCounts[element.status] || 0;
								if (itemValue) {
									val = itemValue(element);
								}
								if (val) {
									currentCounts[element.status] = current + val;
								}

							});
							return currentCounts;
						},
						flattened = _.map(rawCounts(), function (v, k) {
							return [k, v];
						}),
						sorted = flattened.sort(function (row1, row2) {
							var config1 = statusConfig[row1[0]] || {},
								config2 = statusConfig[row2[0]] || {},
								priority1 = config1.priority || 0,
								priority2 = config2.priority || 0;
							if (priority1 === priority2) {
								return config1.description.localeCompare(config2.description);
							} else {
								return priority2 - priority1;
							}
						});
					_.each(sorted, function (row) {
						row[0] = (statusConfig[row[0]] && statusConfig[row[0]].description) || row[0];
					});
					sorted.total = dataTotaliser;
					return sorted;
				}};
			};
		projections.push(buildSumByStatusProjection('Counts'));
		projections.push(buildPercentProjection('Percentages', projections[0].iterator));
		_.each(getMeasurementConfig(activeContent), function (measurement) {
			var totalProjection = buildSumByStatusProjection('Total ' +  measurement, function (item) {
				var val = parseFloat(item.measurements && item.measurements[measurement]) || 0;
				return val;
			});
			projections.push(totalProjection);
			projections.push(buildPercentProjection('Percentage ' + measurement, totalProjection.iterator));
		});
		return projections;
	};

	self.dataAdapter = function (activeContent, filter) {
		var statusConfig = activeContent && activeContent.attr && activeContent.attr[statusConfigAttr] || {},
			result = [];
		filter = filter || {};
		if (filter.selectedSubtree) {
			activeContent = activeContent.findSubIdeaById(mapModel.getCurrentlySelectedIdeaId()) || activeContent;
		}
		activeContent.traverse(function (idea) {
			var stat = idea.attr && idea.attr[statusAttributeName],
				resultItem;
			if (!filter.includeParents && _.find(idea.ideas, function (subidea) {
				return subidea.attr && subidea.attr[statusAttributeName] === stat;
			})) {
				return;
			}
			if (stat && statusConfig[stat] && (!filter.statuses  || _.include(filter.statuses, stat))) {
				resultItem = {status: stat, id: idea.id};
				if (idea.title) {
					resultItem.title = idea.title;
				}
				if (idea.attr && idea.attr[measurementAttributeName]) {
					resultItem.measurements = idea.attr[measurementAttributeName];
				}
				result.push(resultItem);
			}
		});
		return result;
	};
};

MM.progressCalcChangeMediator = function (calcModel, activeContentListener, mapModel, configStatusUpdater) {
	'use strict';
	var publishData = function (activeContent) {
			calcModel.dataUpdated(activeContent);
		};
	configStatusUpdater.addEventListener('configChanged', function () {
		calcModel.setFilter({});
	});
	mapModel.addEventListener('nodeSelectionChanged', function () {
		var filter = calcModel.getFilter() || {};
		if (filter.selectedSubtree) {
			publishData(activeContentListener.getActiveContent());
		}
	});
	activeContentListener.addListener(publishData);
};
MM.sortProgressConfig = function (config) {
	'use strict';
	var	configWithKeys = _.map(config, function (val, idx) {
			return _.extend({key: idx}, val);
		}),
		sortedAlpha = _.sortBy(configWithKeys, function (status) {
			return status.description || status.key;
		});
	return _.sortBy(sortedAlpha, function (status) {
		return -1 * status.priority || 0;
	});
};


$.fn.progressFilterWidget = function (calcModel, contentStatusUpdater) {
	'use strict';
	return this.each(function () {
		var self = jQuery(this),
			toggleButton = self.find('[data-mm-role=toggle-widget]'),
			filterSection = self.find('[data-mm-role=filter]'),
			statusList = filterSection.find('[data-mm-role=status-list]'),
			statusTemplate = statusList.find('[data-mm-role=template]').detach(),
			statusCheckboxSelector = 'input[data-mm-role=status-checkbox]',
			toggleCheckboxSelector = 'input[data-mm-role=toggle-property]',
			selectAllStatusesButton = self.find('[data-mm-role=select-all-statuses]'),
			onFilterChanged = function (newFilter) {
				newFilter = newFilter || calcModel.getFilter;
				if (!newFilter || !newFilter.statuses) {
					selectAllStatusesButton.css('visibility', 'hidden');
					statusList.find(statusCheckboxSelector).prop('checked', true);
				} else {
					selectAllStatusesButton.css('visibility', 'visible');
					statusList.find(statusCheckboxSelector).prop('checked', function () {
						return _.include(newFilter.statuses, this.value);
					});
				}
				filterSection.find(toggleCheckboxSelector).prop('checked', function () {
					return !!(newFilter && newFilter[this.value]);
				});
			},
			onDataUpdate = function (newData, newFilter) {
				onFilterChanged(newFilter);
			},
			setFilterUIVisible = function (visible) {
				if (visible) {
					filterSection.show();
					calcModel.addEventListener('dataUpdated', onDataUpdate);
				} else {
					filterSection.hide();
					calcModel.removeEventListener('dataUpdated', onDataUpdate);
				}
			},
			changeFilter = function () {
				var checkBoxes = statusList.find(statusCheckboxSelector),
					filter = {},
					checkedStatuses = _.map(checkBoxes.filter(':checked'), function (domCheckbox) {
						return domCheckbox.value;
					});
				if (checkedStatuses.length < checkBoxes.length) {
					filter.statuses = checkedStatuses;
				}
				_.each(filterSection.find(toggleCheckboxSelector).filter(':checked'), function (domCheckbox) {
					filter[domCheckbox.value] = true;
				});
				calcModel.setFilter(filter);
			},
			rebuildUI = function (config) {
				if (config) {
					var sortedConfig = MM.sortProgressConfig(config);
					statusList.empty();
					_.each(sortedConfig, function (config) {
						var newRow = statusTemplate.clone().appendTo(statusList);
						newRow.find('[data-mm-role=status-description]').text(config.description);
						newRow.find('[data-mm-role=status-checkbox]').prop('value', config.key).click(changeFilter);
					});
					onFilterChanged();
					self.show();
				} else {
					self.hide();
				}
			};
		contentStatusUpdater.addEventListener('configChanged', rebuildUI);
		filterSection.hide();
		toggleButton.click(function () {
			setFilterUIVisible(filterSection.css('display') === 'none');
		});
		selectAllStatusesButton.click(function () {
			statusList.find(statusCheckboxSelector).prop('checked', true);
			changeFilter();
		});
		filterSection.find(toggleCheckboxSelector).click(changeFilter);
	});
};


MM.ContentStatusUpdater = function (statusAttributeName, statusConfigurationAttributeName, measurementAttributeName, measurementConfigurationAttributeName, activeContentListener) {
	'use strict';
	var self = observable(this),
		findStatus = function (statusName) {
			return activeContentListener.getActiveContent().getAttr(statusConfigurationAttributeName)[statusName];
		},
		statusPriority = function (statusName) {
			var s = findStatus(statusName);
			return s && s.priority;
		},
		onActiveContentChanged = function (content, isNew, method, attrs) {
			/*jslint eqeq:true*/
			if (method && attrs && method === 'updateAttr' && attrs[0] == content.id) {
				if (attrs[1] === statusConfigurationAttributeName) {
					self.dispatchEvent('configChanged', attrs[2]);
				} else if (attrs[1] === measurementConfigurationAttributeName) {
					self.dispatchEvent('measurementsChanged', attrs[2]);
				}
			}

			if (isNew) {
				self.refresh();
			}
		},
		clearStatus = function (ideaId) {
			var statusName = activeContentListener.getActiveContent().getAttrById(ideaId, statusAttributeName),
				status = statusName && findStatus(statusName),
				currentStyle;
			if (status) {
				if (status.icon) {
					activeContentListener.getActiveContent().updateAttr(ideaId, 'icon', false);
				}
				if (status.style) {
					currentStyle = activeContentListener.getActiveContent().getAttrById(ideaId, 'style');
					activeContentListener.getActiveContent().updateAttr(ideaId, 'style', _.omit(currentStyle, _.keys(status.style)));
				}
			}
			activeContentListener.getActiveContent().updateAttr(ideaId, statusAttributeName, false);
		},
		recursiveClear = function (idea) {
			clearStatus(idea.id);
			_.each(idea.ideas, recursiveClear);
		};
	self.setStatusConfig = function (statusConfig) {
		var content = activeContentListener.getActiveContent(),
			validatedConfig = {};
		if (!statusConfig) {
			content.updateAttr(content.id, statusConfigurationAttributeName, false);
			return;
		}
		_.each(statusConfig, function (element, key) {
			validatedConfig[key] = _.clone(element);
			if (isNaN(validatedConfig[key].priority)) {
				delete validatedConfig[key].priority;
			}
		});
		content.updateAttr(content.id, statusConfigurationAttributeName, validatedConfig);
	};

	self.updateStatus = function (ideaId, newStatusName) {
		var result = false,
			changeStatus = function (id, statusName) {
				var status = findStatus(statusName),
					merged,
					content = activeContentListener.getActiveContent();
				if (!status) {
					return false;
				}
				clearStatus(id);
				if (status.style) {
					merged = _.extend({}, content.getAttrById(id, 'style'), status.style);
					content.updateAttr(id, 'style', merged);
				}
				if (status.icon) {
					content.updateAttr(id, 'icon', status.icon);
				}
				return content.updateAttr(id, statusAttributeName, statusName);
			},
			shouldPropagate = function (parent) {
				var childStatusNames = _.uniq(_.map(parent.ideas, function (child) {
					return child.getAttr(statusAttributeName);
				}));
				if (childStatusNames.length === 1) {
					return childStatusNames[0];
				}
				if (!_.some(childStatusNames, statusPriority)) {
					return false;
				}
				return _.max(childStatusNames, statusPriority);
			};
		if (changeStatus(ideaId, newStatusName)) {
			_.each(activeContentListener.getActiveContent().calculatePath(ideaId), function (parent) {
				var parentStatusName = shouldPropagate(parent);
				if (parentStatusName) {
					changeStatus(parent.id, parentStatusName);
				}
			});
			result = true;
		}
		return result;
	};
	self.setMeasurements = function (updatedMeasurements) {
		var content = activeContentListener.getActiveContent();
		content.updateAttr(content.id, measurementConfigurationAttributeName, updatedMeasurements);
	};
	self.clear = function () {
		recursiveClear(activeContentListener.getActiveContent());
	};
	self.refresh = function () {
		var content = activeContentListener.getActiveContent();
		self.dispatchEvent('configChanged', content.getAttr(statusConfigurationAttributeName));
		self.dispatchEvent('measurementsChanged', content.getAttr(measurementConfigurationAttributeName));
	};
	activeContentListener.addListener(onActiveContentChanged);

};
jQuery.fn.progressStatusUpdateWidget = function (updater, mapModel, configurations, alertController) {
	'use strict';
	var	element = this,
		template = element.find('[data-mm-role=status-template]').detach(),
		generateStatuses = function (config) {
			var domParent = element.find('[data-mm-role=status-list]'),
				sortedConfig = MM.sortProgressConfig(config);
			_.each(sortedConfig.reverse(), function (status) {
				var newItem = template.clone().prependTo(domParent);
				newItem.attr('data-mm-role', 'progress');
				if (status.style && status.style.background) {
					newItem.find('[data-mm-role=status-color]').css('backgroundColor', status.style.background).val(status.style.background);
				}
				newItem.find('[data-mm-role=status-name]').text(status.description);
				newItem.attr('data-mm-progress-key', status.key);
				newItem.find('[data-mm-role=status-priority]').text(status.priority);
				newItem.find('[data-mm-role=set-status]').click(function () {
					mapModel.applyToActivated(function (id) {
						updater.updateStatus(id, status.key);
					});
				});
				MM.Extensions.progress.updateIcon(newItem.find('[data-mm-role=status-icon]'), status.icon);

			});
		},
		updateUI = function (config) {
			var flag = (config) ? 'active' : 'inactive',
				items = element.find('[data-mm-progress-visible]');
			items.hide();
			items.filter('[data-mm-progress-visible=' + flag + ']').show();
			element.find('[data-mm-role=progress]').remove();
			if (!updater) {
				return;
			}
			generateStatuses(config);
		},
		urlForStatusConfigFile = function (configName) {
			return MM.Extensions.mmConfig.publicUrl + '/e/' + configName;
		},
		bindGenericFunctions = function () {
			element.find('[data-mm-role=start]').click(function () {
				var type = jQuery(this).data('mm-progress-type'),
					statusConfig = configurations[type],
					alertId;
				if (_.isObject(statusConfig)) {
					updater.setStatusConfig(statusConfig);
				} else {
					alertId = alertController.show('<i class="icon-spinner icon-spin" />&nbsp;Loading progress configuration', statusConfig, 'info');
					jQuery.ajax({
						url: urlForStatusConfigFile(statusConfig),
						dataType: 'json'
					}).then(function (result) {
						alertController.hide(alertId);
						updater.setStatusConfig(result);
					}, function () {
						alertController.hide(alertId);
						alertController.show('Error Loading progress configuration from URL', statusConfig, 'error');
					});
				}
				return false;
			});
			element.find('[data-mm-role=deactivate]').click(function () {
				updater.setStatusConfig(false);
			});
			element.find('[data-mm-role=clear]').click(function () {
				if (updater) {
					updater.clear();
				}
			});
			element.find('[data-mm-role=toggle-toolbar]').click(function () {
				jQuery('body').toggleClass('progress-toolbar-active');
			});
			element.find('[data-mm-role=save]').click(function () {
				var config = {},
					statuses = element.find('[data-mm-role=status-list] [data-mm-role=progress]'),
					existing = _.reject(
						_.unique(_.map(statuses, function (x) {
							return parseInt(jQuery(x).attr('data-mm-progress-key'), 10);
						})),
						function (x) {
							return isNaN(x);
						}
					),
					autoKey = 1;
				if (existing.length > 0) {
					autoKey = 1 + _.max(existing);
				}
				statuses.each(function () {
					var status = jQuery(this),
						statusConfig = {
							description: status.find('[data-mm-role=status-name]').text()
						},
						backgroundColor = status.find('[data-mm-role=status-color]').val(),
						icon = status.find('[data-mm-role=status-icon]').data('icon'),
						priority = status.find('[data-mm-role=status-priority]').text(),
						key = status.attr('data-mm-progress-key');
					if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'false') {
						statusConfig.style = {background: backgroundColor };
					}
					if (icon) {
						statusConfig.icon = icon;
					}
					if (!key) {
						key = autoKey++;
					}
					if (priority) {
						statusConfig.priority = priority;
					}
					config[key] = statusConfig;
				});
				updater.setStatusConfig(config);
			});
		};
	bindGenericFunctions();
	updater.addEventListener('configChanged', function (config) {
		updateUI(config);
	});
	updateUI();
	return this;
};
jQuery.fn.tableCellInPlaceEditorWidget = function (defaultValue) {
	'use strict';

	this.click(function () {
		var element = jQuery(this),
			previousText = element.text(),
			input,
			setContent = function (value) {
				element.empty().text(value);
				element.trigger('change');
			},
			oldWidth = Math.max(element.innerWidth() - 60, 50);
		if (element.find('input').length > 0) {
			return;
		}
		element.empty();
		input = jQuery('<input width="100%">')
			.appendTo(element)
			.val(defaultValue || previousText)
			.blur(function () {
				setContent(input.val());
			}).keydown('esc', function (e) {
				setContent(previousText);
				e.preventDefault();
				e.stopPropagation();
			}).keydown('return', function (e) {
				setContent(input.val());
				e.preventDefault();
				e.stopPropagation();
			}).width(oldWidth).click(function (e) {
				e.stopPropagation();
				e.preventDefault();
			}).focus();
	});
	this.css('cursor', 'pointer');
	return this;
};
jQuery.fn.tableEditWidget = function (contentRefreshCallBack, iconEditor) {
	'use strict';
	var modal = this,
		template = modal.find('[data-mm-role=status-template]').clone().removeAttr('data-mm-role'),
		rebind = function (container) {
			container.find('[data-mm-editable]').tableCellInPlaceEditorWidget().removeAttr('data-mm-editable');
			container.find('[data-mm-color-picker]').removeAttr('data-mm-color-picker').colorPicker();
			container.find('[data-mm-role=remove]').click(function () {
				jQuery(this).parents('tr').fadeOut(500, function () {
					jQuery(this).remove();
				});
			}).removeAttr('data-mm-role');
			container.find('[data-mm-role=status-icon]').click(function () {
				var statusIconDom = $(this);
				iconEditor.editIcon(statusIconDom.data('icon')).then(function (newIcon) {
					MM.Extensions.progress.updateIcon(statusIconDom, newIcon);
				});
			});
		};
	modal.on('show', function () {
		if (contentRefreshCallBack()) {
			contentRefreshCallBack();
		}
		rebind(modal);
	});
	modal.find('[data-mm-role=append]').click(function () {
		var newItem = template.clone().attr('data-mm-role', template.attr('data-mm-new-role')).appendTo(modal.find('[data-mm-role=status-list]'));
		rebind(newItem);
		newItem.find('[data-mm-default-edit]').click();
	});
	return modal;
};

MM.Extensions.progress = function () {
	'use strict';
	var statusConfigurationAttributeName = MM.Extensions.config.progress.aggregateAttributeName,
		statusAttributeName = 'progress',
		measurementsConfigurationAttributeName = MM.Extensions.config.progress.measurementsConfigName,
		measureAttributeName = 'measurements',
		activeContentListener = MM.Extensions.components.activeContentListener,
		alertController = MM.Extensions.components.alert,
		mapModel = MM.Extensions.components.mapModel,
		iconEditor = MM.Extensions.components.iconEditor,
		measuresModel = MM.Extensions.components.measuresModel,
		progressCalc = new MM.Progress.Calc(statusAttributeName, statusConfigurationAttributeName, measureAttributeName, measurementsConfigurationAttributeName, mapModel),
		calcModel = new MM.CalcModel(progressCalc, MM.Extensions.components.activityLog),
		loadUI = function (html) {
			var parsed = $(html),
				menu = parsed.find('[data-mm-role=top-menu]').clone().appendTo($('#mainMenu')),
				toolbar = parsed.find('[data-mm-role=floating-toolbar]').clone().appendTo($('body')).draggable().css('position', 'absolute'),
				modal = parsed.find('[data-mm-role=modal]').clone().appendTo($('body')),
				calcWidget = parsed.find('#progress-calc-widget'),
				updater;
			$('#mainMenu').find('[data-mm-role=optional]').hide();
			updater = new MM.ContentStatusUpdater(statusAttributeName, statusConfigurationAttributeName, measureAttributeName, measurementsConfigurationAttributeName, activeContentListener);
			menu.progressStatusUpdateWidget(updater, mapModel, MM.Extensions.progress.statusConfig, alertController);
			toolbar.progressStatusUpdateWidget(updater, mapModel, MM.Extensions.progress.statusConfig, alertController);
			modal.tableEditWidget(updater.refresh.bind(updater), iconEditor).progressStatusUpdateWidget(updater, mapModel, MM.Extensions.progress.statusConfig, alertController);
			calcWidget.detach().appendTo($('body')).calcWidget(calcModel, measuresModel).floatingToolbarWidget();
			calcWidget.find('[data-mm-role=filter-widget]').progressFilterWidget(calcModel, updater);
			MM.progressCalcChangeMediator(calcModel, activeContentListener, mapModel, updater);
		};
	MM.Extensions.mmConfig.activeContentConfiguration.nonClonedAttributes.push(statusConfigurationAttributeName);
	$.get(MM.Extensions.mmConfig.publicUrl + '/e/progress.html', loadUI);
	$('<link rel="stylesheet" href="' +  MM.Extensions.mmConfig.publicUrl + '/e/progress.css" />').appendTo($('body'));
};
MM.Extensions.progress.updateIcon = function (selector, icon) {
	'use strict';
	selector.data('icon', icon);
	if (icon) {
		selector.find('[data-mm-role=icon-image-placeholder]').attr('src', icon.url).show();
		selector.find('[data-mm-role=icon-no-image]').hide();
	} else {
		selector.find('[data-mm-role=icon-image-placeholder]').hide();
		selector.find('[data-mm-role=icon-no-image]').show();
	}
};
MM.Extensions.progress.statusConfig = {};
MM.Extensions.progress.statusConfig.testing = {
	'': {
		description: 'Not Started',
		priority: 1,
		style: {
			background: false
		}
	},
	'passing': {
		description: 'Passed',
		style: {
			background: '#00CC00'
		}
	},
	'in-progress': {
		description: 'In Progress',
		priority: 2,
		style: {
			background: '#FFCC00'
		}
	},
	'failure': {
		description: 'Failed',
		priority: 999,
		style: {
			background: '#FF3300'
		}
	}
};
MM.Extensions.progress.statusConfig.tasks = {
	'': {
		description: 'Not Started',
		priority: 1,
		style: {
			background: false
		}
	},
	'passing': {
		description: 'Done',
		style: {
			background: '#00CC00'
		}
	},
	'under-review' : {
		description: 'Under review',
		style: {
			background: '#00CCFF'
		}
	},
	'in-progress': {
		description: 'In Progress',
		priority: 3,
		style: {
			background: '#FFCC00'
		}
	},
	'blocked': {
		description: 'Blocked',
		priority: 4,
		style: {
			background: '#990033'
		}
	},
	'parked': {
		description: 'Parked',
		priority: 2,
		style: {
			background: '#FF3300'
		}
	}
};
MM.Extensions.progress.statusConfig.testingWithIcons = 'progress-testing-with-flat-icons.json';
MM.Extensions.progress.statusConfig.testingWith3DIcons = 'progress-testing-with-3d-icons.json';
MM.Extensions.progress.statusConfig.tasksWith3DIcons = 'progress-tasks-with-3d-icons.json';
MM.Extensions.progress.statusConfig.tasksWithIcons = 'progress-tasks-with-flat-icons.json';
if (!window.jasmine) {
	MM.Extensions.progress();
}
