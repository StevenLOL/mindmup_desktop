/*global MAPJS*/
MAPJS.DOMRender.nodeConnectorPath = function (parent, child) {
		'use strict';
		var position = {
			left: Math.min(parent.left, child.left),
			top: Math.min(parent.top, child.top)
		};
		position.width = Math.max(parent.left + parent.width, child.left + child.width, position.left + 1) - position.left;
		position.height = Math.max(parent.top + parent.height, child.top + child.height, position.top + 1) - position.top;
		return {
			'd': 'M' + Math.round(parent.left + 0.5 * parent.width - position.left)  + ',' + Math.round(parent.top + 0.5 * parent.height - position.top) + 'L' + Math.round(child.left + 0.5 * child.width - position.left) + ',' + Math.round(child.top + 0.5 * child.height - position.top),
			'position': position
		};

	};
