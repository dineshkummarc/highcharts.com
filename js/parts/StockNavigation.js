
// constants
var	MOUSEDOWN = hasTouch ? 'touchstart' : 'mousedown',
	MOUSEMOVE = hasTouch ? 'touchmove' : 'mousemove',
	MOUSEUP = hasTouch ? 'touchend' : 'mouseup';




/* ****************************************************************************
 * Start Scroller code														*
 *****************************************************************************/

var buttonGradient = {
		linearGradient: [0, 0, 0, 14],
		stops: [
			[0, '#FFF'],
			[1, '#CCC']
		]
	};

extend(defaultOptions, {
	navigator: {
		//enabled: true,
		handles: {
			backgroundColor: '#FFF',
			borderColor: '#666'
		},
		height: 40,
		margin: 10,
		maskFill: 'rgba(255, 255, 255, 0.75)',
		outlineColor: '#444',
		outlineWidth: 1,
		series: {
			type: 'areaspline',
			color: '#4572A7',
			fillOpacity: 0.4,
			dataGrouping: {
				smoothed: true
			},
			lineWidth: 1,
			marker: {
				enabled: false
			},
			shadow: false
		},
		//top: undefined, // docs
		xAxis: {
			tickWidth: 0,
			lineWidth: 0,
			gridLineWidth: 1,
			tickPixelInterval: 200,
			labels: {
				align: 'left',
				x: 3,
				y: -4
			}
		},
		yAxis: {
			gridLineWidth: 0,
			startOnTick: false,
			endOnTick: false,
			minPadding: 0.1,
			maxPadding: 0.1,
			labels: {
				enabled: false
			},
			title: {
				text: null
			},
			tickWidth: 0
		}
	},
	scrollbar: {
		//enabled: true
		height: hasTouch ? 20 : 14,
		barBackgroundColor: buttonGradient,
		barBorderRadius: 2,
		barBorderWidth: 1,
		barBorderColor: '#666',
		buttonArrowColor: '#666',
		buttonBackgroundColor: buttonGradient,
		buttonBorderColor: '#666',
		buttonBorderRadius: 2,
		buttonBorderWidth: 1,
		rifleColor: '#666',
		trackBackgroundColor: {
			linearGradient: [0, 0, 0, 10],
			stops: [
				[0, '#EEE'],
				[1, '#FFF']
			]
		},
		trackBorderColor: '#CCC',
		trackBorderWidth: 1
		// trackBorderRadius: 0
	}
});

/**
 * The Scroller class
 * @param {Object} chart
 */
function Scroller(chart) {

	var renderer = chart.renderer,
		chartOptions = chart.options,
		navigatorOptions = chartOptions.navigator,
		navigatorEnabled = navigatorOptions.enabled,
		navigatorLeft,
		navigatorSeries,
		scrollbarOptions = chartOptions.scrollbar,
		scrollbarEnabled = scrollbarOptions.enabled,
		grabbedLeft,
		grabbedRight,
		grabbedCenter,
		otherHandlePos,
		dragOffset,
		hasDragged,
		xAxis,
		yAxis,
		zoomedMin,
		zoomedMax,
		range,

		bodyStyle = document.body.style,
		defaultBodyCursor,

		handlesOptions = navigatorOptions.handles,
		height = navigatorEnabled ? navigatorOptions.height : 0,
		outlineWidth = navigatorOptions.outlineWidth,
		scrollbarHeight = scrollbarEnabled ? scrollbarOptions.height : 0,
		outlineHeight = height + scrollbarHeight,
		barBorderRadius = scrollbarOptions.barBorderRadius,
		top = navigatorOptions.top || chart.chartHeight - height - scrollbarHeight - chartOptions.chart.spacingBottom,
		halfOutline = outlineWidth / 2,
		outlineTop,
		plotLeft,
		plotWidth,
		rendered,
		baseSeriesOption = navigatorOptions.baseSeries,
		baseSeries = chart.series[baseSeriesOption] ||
			(typeof baseSeriesOption === 'string' && chart.get(baseSeriesOption)) ||
			chart.series[0],

		// element wrappers
		leftShade,
		rightShade,
		outline,
		handles = [],
		scrollbarGroup,
		scrollbarTrack,
		scrollbar,
		scrollbarRifles,
		scrollbarButtons = [];

	chart.resetZoomEnabled = false;

	/**
	 * Draw one of the handles on the side of the zoomed range in the navigator
	 * @param {Number} x The x center for the handle
	 * @param {Number} index 0 for left and 1 for right
	 */
	function drawHandle(x, index) {

		var attr = {
				fill: handlesOptions.backgroundColor,
				stroke: handlesOptions.borderColor,
				'stroke-width': 1
			};

		// create the elements
		if (!rendered) {

			// the group
			handles[index] = renderer.g()
				.css({ cursor: 'e-resize' })
				.attr({ zIndex: 3 })
				.add();

			// the rectangle
			renderer.rect(-4.5, 0, 9, 16, 3, 1)
				.attr(attr)
				.add(handles[index]);

			// the rifles
			renderer.path([
					'M',
					-1.5, 4,
					'L',
					-1.5,	12,
					'M',
					0.5, 4,
					'L',
					0.5, 12
				]).attr(attr)
				.add(handles[index]);
		}

		handles[index].translate(plotLeft + scrollbarHeight + parseInt(x, 10), top + height / 2 - 8);
	}

	/**
	 * Draw the scrollbar buttons with arrows
	 * @param {Number} index 0 is left, 1 is right
	 */
	function drawScrollbarButton(index) {

		if (!rendered) {

			var crisp = scrollbarOptions.buttonBorderWidth % 2 / 2;
			scrollbarButtons[index] = renderer.g().add(scrollbarGroup);

			renderer.rect(
				crisp,
				crisp,
				scrollbarHeight,
				scrollbarHeight,
				scrollbarOptions.buttonBorderRadius
			).attr({
				stroke: scrollbarOptions.buttonBorderColor,
				'stroke-width': scrollbarOptions.buttonBorderWidth,
				fill: scrollbarOptions.buttonBackgroundColor
			}).add(scrollbarButtons[index]);

			renderer.path([
				'M',
				scrollbarHeight / 2 + (index ? -1 : 1), scrollbarHeight / 2 - 3,
				'L',
				scrollbarHeight / 2 + (index ? -1 : 1), scrollbarHeight / 2 + 3,
				scrollbarHeight / 2 + (index ? 2 : -2), scrollbarHeight / 2
			]).attr({
				fill: scrollbarOptions.buttonArrowColor
			}).add(scrollbarButtons[index]);
		}

		// adjust the right side button to the varying length of the scroll track
		if (index) {
			scrollbarButtons[index].attr({
				translateX: plotWidth - scrollbarHeight
			});
		}
	}

	/**
	 * Render the navigator and scroll bar
	 * @param {Number} min X axis value minimum
	 * @param {Number} max X axis value maximum
	 * @param {Number} pxMin Pixel value minimum
	 * @param {Number} pxMax Pixel value maximum
	 */
	function render(min, max, pxMin, pxMax) {

		outlineTop = top + halfOutline;
		plotLeft = chart.plotLeft;
		plotWidth = chart.plotWidth;
		navigatorLeft = plotLeft + scrollbarHeight;

		pxMin = pick(pxMin,	xAxis.translate(min));
		pxMax = pick(pxMax, xAxis.translate(max));

		// set the scroller x axis extremes to reflect the total
		if (rendered && xAxis.getExtremes) {
			var newExtremes = chart.xAxis[0].getExtremes(),
				oldExtremes = xAxis.getExtremes();

			if (newExtremes.dataMin !== oldExtremes.min ||
					newExtremes.dataMax !== oldExtremes.max) {
				xAxis.setExtremes(newExtremes.dataMin, newExtremes.dataMax);
			}
		}

		//logTime && console.log(Highcharts.dateFormat('%Y-%m-%d', newExtremes.max))

		// handles are allowed to cross
		zoomedMin = parseInt(mathMin(pxMin, pxMax), 10);
		zoomedMax = parseInt(mathMax(pxMin, pxMax), 10);
		range = zoomedMax - zoomedMin;

		// on first render, create all elements
		if (!rendered) {

			if (navigatorEnabled) {

				leftShade = renderer.rect()
					.attr({
						fill: navigatorOptions.maskFill,
						zIndex: 3
					}).add();
				rightShade = renderer.rect()
					.attr({
						fill: navigatorOptions.maskFill,
						zIndex: 3
					}).add();
				outline = renderer.path()
					.attr({
						'stroke-width': outlineWidth,
						stroke: navigatorOptions.outlineColor,
						zIndex: 3
					})
					.add();
			}

			if (scrollbarEnabled) {
				scrollbarGroup = renderer.g().add();

				scrollbarTrack = renderer.rect().attr({
					fill: scrollbarOptions.trackBackgroundColor,
					stroke: scrollbarOptions.trackBorderColor,
					'stroke-width': scrollbarOptions.trackBorderWidth,
					r: scrollbarOptions.trackBorderRadius || 0,
					height: scrollbarHeight
				}).add(scrollbarGroup);

				scrollbar = renderer.rect()
					.attr({
						height: scrollbarHeight,
						fill: scrollbarOptions.barBackgroundColor,
						stroke: scrollbarOptions.barBorderColor,
						'stroke-width': scrollbarOptions.barBorderWidth,
						rx: barBorderRadius,
						ry: barBorderRadius
					})
					.add(scrollbarGroup);

				scrollbarRifles = renderer.path()
					.attr({
						stroke: scrollbarOptions.rifleColor,
						'stroke-width': 1
					})
					.add(scrollbarGroup);
			}
		}

		// place elements
		if (navigatorEnabled) {
			leftShade.attr({
				x: navigatorLeft,
				y: top,
				width: zoomedMin,
				height: height
			});
			rightShade.attr({
				x: navigatorLeft + zoomedMax,
				y: top,
				width: plotWidth - zoomedMax - 2 * scrollbarHeight,
				height: height
			});
			outline.attr({ d: [
				'M',
				plotLeft, outlineTop, // left
				'L',
				navigatorLeft + zoomedMin - halfOutline,	outlineTop, // upper left of zoomed range
				navigatorLeft + zoomedMin - halfOutline,	outlineTop + outlineHeight, // lower left of z.r.
				navigatorLeft + zoomedMax + halfOutline,	outlineTop + outlineHeight, // lower right of z.r.
				navigatorLeft + zoomedMax + halfOutline,	outlineTop, // upper right of z.r.
				plotLeft + plotWidth, outlineTop // right
			]});
			// draw handles
			drawHandle(zoomedMin - halfOutline, 0);
			drawHandle(zoomedMax + halfOutline, 1);
		}

		// draw the scrollbar
		if (scrollbarEnabled) {

			// draw the buttons
			drawScrollbarButton(0);
			drawScrollbarButton(1);

			scrollbarGroup.translate(plotLeft, outlineTop + height);

			scrollbarTrack.attr({
				width: plotWidth
			});

			scrollbar.attr({
				x: scrollbarHeight + zoomedMin,
				width: range
			});

			var centerBarX = scrollbarHeight + zoomedMin + range / 2 - 0.5;

			scrollbarRifles.attr({ d: [
					'M',
					centerBarX - 3, scrollbarHeight / 4,
					'L',
					centerBarX - 3, 2 * scrollbarHeight / 3,
					'M',
					centerBarX, scrollbarHeight / 4,
					'L',
					centerBarX, 2 * scrollbarHeight / 3,
					'M',
					centerBarX + 3, scrollbarHeight / 4,
					'L',
					centerBarX + 3, 2 * scrollbarHeight / 3
				],
				visibility: range > 12 ? 'visible' : 'hidden'
			});
		}

		rendered = true;
	}

	/**
	 * Set up the mouse and touch events for the navigator and scrollbar
	 */
	function addEvents() {
		addEvent(chart.container, MOUSEDOWN, function(e) {
			e = chart.tracker.normalizeMouseEvent(e);
			var chartX = e.chartX,
				chartY = e.chartY,
				handleSensitivity = hasTouch ? 10 : 7,
				left,
				isOnNavigator;

			if (chartY > top && chartY < top + height + scrollbarHeight) { // we're vertically inside the navigator
				isOnNavigator = !scrollbarEnabled || chartY < top + height;

				// grab the left handle
				if (isOnNavigator && math.abs(chartX - zoomedMin - navigatorLeft) < handleSensitivity) {
					grabbedLeft = true;
					otherHandlePos = zoomedMax;
				}

				// grab the right handle
				else if (isOnNavigator && math.abs(chartX - zoomedMax - navigatorLeft) < handleSensitivity) {
					grabbedRight = true;
					otherHandlePos = zoomedMin;
				}

				// grab the zoomed range
				else if (chartX > navigatorLeft + zoomedMin && chartX < navigatorLeft + zoomedMax) {
					grabbedCenter = chartX;
					defaultBodyCursor = bodyStyle.cursor;
					bodyStyle.cursor = 'ew-resize';

					dragOffset = chartX - zoomedMin;
				}

				// click on the shaded areas
				else if (chartX > plotLeft && chartX < plotLeft + plotWidth) {

					if (isOnNavigator) { // center around the clicked point
						left = chartX - navigatorLeft - range / 2;
					} else { // click on scrollbar
						if (chartX < navigatorLeft) { // click left scrollbar button
							left = zoomedMin - mathMin(10, range);
						} else if (chartX > plotLeft + plotWidth - scrollbarHeight)  {
							left = zoomedMin + mathMin(10, range);
						} else {
							// shift the scrollbar by one range
							left = chartX < navigatorLeft + zoomedMin ? // on the left
								zoomedMin - range :
								zoomedMax;
						}
					}
					if (left < 0) {
						left = 0;
					} else if (left + range > plotWidth - 2 * scrollbarHeight) {
						left = plotWidth - range - 2 * scrollbarHeight;
					}
					chart.xAxis[0].setExtremes(
						xAxis.translate(left, true),
						xAxis.translate(left + range, true),
						true,
						false
					);
				}
			}
			if (e.preventDefault) { // tries to drag object when clicking on the shades
				e.preventDefault();
			}
		});

		addEvent(chart.container, MOUSEMOVE, function(e) {
			e = chart.tracker.normalizeMouseEvent(e);
			var chartX = e.chartX;

			// validation for handle dragging
			if (chartX < navigatorLeft) {
				chartX = navigatorLeft;
			} else if (chartX > plotLeft + plotWidth - scrollbarHeight) {
				chartX = plotLeft + plotWidth - scrollbarHeight;
			}

			// drag left handle
			if (grabbedLeft) {
				hasDragged = true;
				render(0, 0, chartX - navigatorLeft, otherHandlePos);

			// drag right handle
			} else if (grabbedRight) {
				hasDragged = true;
				render(0, 0, otherHandlePos, chartX - navigatorLeft);

			// drag scrollbar or open area in navigator
			} else if (grabbedCenter) {
				hasDragged = true;
				if (chartX < dragOffset) { // outside left
					chartX = dragOffset;
				} else if (chartX > plotWidth + dragOffset - range - 2 * scrollbarHeight) { // outside right
					chartX = plotWidth + dragOffset - range - 2 * scrollbarHeight;
				}

				render(0, 0, chartX - dragOffset, chartX - dragOffset + range);
			}
		});

		addEvent(document, MOUSEUP, function() {
			if (hasDragged) {
				chart.xAxis[0].setExtremes(
					xAxis.translate(zoomedMin, true),
					xAxis.translate(zoomedMax, true),
					true,
					false
				);
			}
			grabbedLeft = grabbedRight = grabbedCenter = hasDragged = dragOffset = null;
			bodyStyle.cursor = defaultBodyCursor;
		});
	}

	/**
	 * Initiate the Scroller object
	 */
	function init() {
		var xAxisIndex = chart.xAxis.length,
			yAxisIndex = chart.yAxis.length;

		// make room below the chart
		chart.extraBottomMargin = outlineHeight + navigatorOptions.margin;

		if (navigatorEnabled) {
			var baseOptions = baseSeries.options,
				navigatorSeriesOptions,
				data = baseOptions.data;

			baseOptions.data = null; // remove it to prevent merging one by one

			navigatorSeriesOptions = merge(baseSeries.options, navigatorOptions.series, {
				threshold: null, // docs
				clip: false, // docs
				enableMouseTracking: false,
				group: 'nav', // for columns
				padXAxis: false,
				xAxis: xAxisIndex,
				yAxis: yAxisIndex,
				name: 'Navigator',
				showInLegend: false
			});

			baseOptions.data = navigatorSeriesOptions.data = data;

			// add the series
			navigatorSeries = chart.initSeries(navigatorSeriesOptions);

			// respond to updated data in the base series
			// todo: use similiar hook when base series is not yet initialized
			addEvent(baseSeries, 'updatedData', function() {
				var baseExtremes = baseSeries.xAxis.getExtremes(),
					range = baseExtremes.max - baseExtremes.min,
					stickToMax = baseExtremes.max >=
						navigatorSeries.xData[navigatorSeries.xData.length - 1],
					stickToMin = baseExtremes.min - range <=
						navigatorSeries.xData[0],
					newMax,
					newMin;

				// set the navigator series data to the new data of the base series
				navigatorSeries.options.pointStart = baseSeries.xData[0];
				navigatorSeries.setData(baseSeries.options.data);

				// if the selection is already at the max, move it to the right as new data
				// comes in
				if (stickToMax) {
					newMax = baseExtremes.dataMax;
					baseSeries.xAxis.setExtremes(newMax - range, newMax);
				} else if (stickToMin) {
					newMin = baseExtremes.dataMin;
					baseSeries.xAxis.setExtremes(newMin, newMin + range);
				// if not, just move the scroller window to reflect the new series data
				} else {
					render(
						mathMax(baseExtremes.min, baseExtremes.dataMin),
						mathMin(baseExtremes.max, baseExtremes.dataMax)
					);

				}
			});

			// an x axis is required for scrollbar also
			xAxis = new chart.Axis(merge(navigatorOptions.xAxis, {
				isX: true,
				type: 'datetime',
				index: xAxisIndex,
				height: height, // docs + width
				top: top, // docs + left
				offset: 0,
				offsetLeft: scrollbarHeight, // docs
				offsetRight: -scrollbarHeight, // docs
				startOnTick: false,
				endOnTick: false,
				minPadding: 0,
				maxPadding: 0,
				zoomEnabled: false
			}));

			yAxis = new chart.Axis(merge(navigatorOptions.yAxis, {
				alignTicks: false, // docs
				height: height,
				top: top,
				offset: 0,
				index: yAxisIndex,
				zoomEnabled: false
			}));

		// in case of scrollbar only, fake an x axis to get translation
		} else {
			xAxis = {
				translate: function(value, reverse) {
					var ext = baseSeries.xAxis.getExtremes(),
						scrollTrackWidth = chart.plotWidth - 2 * scrollbarHeight,
						dataMin = ext.dataMin,
						valueRange = ext.dataMax - dataMin;

					return reverse ?
						// from pixel to value
						(value * valueRange / scrollTrackWidth) + dataMin :
						// from value to pixel
						scrollTrackWidth * (value - dataMin) / valueRange;
				}
			};
		}

		addEvents();
	}


	// Run scroller
	init();

	// Expose
	return {
		render: render
	};

}

/* ****************************************************************************
 * End Scroller code														  *
 *****************************************************************************/

/* ****************************************************************************
 * Start Range Selector code												  *
 *****************************************************************************/
extend(defaultOptions, {
	rangeSelector: {
		// enabled: true,
		// buttons: {Object}
		// buttonTheme: {
		//	states: {
		//		hover: {},
		//		select: {}
		//	}
		// },
		// inputEnabled: true,
		// inputStyle: {}
		// labelStyle: {}
		// selected: undefined
		// todo:
		// - button styles for normal, hover and select state
		// - CSS text styles
		// - styles for the inputs and labels
	}
});
defaultOptions.lang = merge(defaultOptions.lang, {
	rangeSelectorZoom: 'Zoom',
	rangeSelectorFrom: 'From:',
	rangeSelectorTo: 'To:'
});

/**
 * The object constructor for the range selector
 * @param {Object} chart
 */
function RangeSelector(chart) {
	var renderer = chart.renderer,
		rendered,
		container = chart.container,
		lang = defaultOptions.lang,
		div,
		leftBox,
		rightBox,
		selected,
		buttons = [],
		buttonOptions,
		options,
		defaultButtons = [{
			type: 'month',
			count: 1,
			text: '1m'
		}, {
			type: 'month',
			count: 3,
			text: '3m'
		}, {
			type: 'month',
			count: 6,
			text: '6m'
		}, {
			type: 'ytd',
			text: 'YTD'
		}, {
			type: 'year',
			count: 1,
			text: '1y'
		}, {
			type: 'all',
			text: 'All'
		}];
		chart.resetZoomEnabled = false;

	/**
	 * The method to run when one of the buttons in the range selectors is clicked
	 * @param {Number} i The index of the button
	 * @param {Object} rangeOptions
	 * @param {Boolean} redraw
	 */
	function clickButton(i, rangeOptions, redraw) {

		var baseAxis = chart.xAxis[0],
			extremes = baseAxis && baseAxis.getExtremes(),
			now,
			dataMin = extremes && extremes.dataMin,
			dataMax = extremes && extremes.dataMax,
			newMin,
			newMax = baseAxis && mathMin(extremes.max, dataMax),
			date = new Date(newMax),
			type = rangeOptions.type,
			count = rangeOptions.count,
			range,
			rangeMin,
			// these time intervals have a fixed number of milliseconds, as opposed
			// to month, ytd and year
			fixedTimes = {
				millisecond: 1,
				second: 1000,
				minute: 60 * 1000,
				hour: 3600 * 1000,
				day: 24 * 3600 * 1000,
				week: 7 * 24 * 3600 * 1000
			};

		// chart has no data, base series is removed
		if (dataMin === null || dataMax === null) {
			return;
		}

		if (fixedTimes[type]) {
			range = fixedTimes[type] * count;
			newMin = mathMax(newMax - range, dataMin);
		}
		else if (type === 'month') {
			date.setMonth(date.getMonth() - count);
			newMin = mathMax(date.getTime(), dataMin);
			range = 30 * 24 * 3600 * 1000 * count;
		}
		else if (type === 'ytd') {
			date = new Date(0);
			now = new Date();
			date.setFullYear(now.getFullYear());
			newMin = rangeMin = mathMax(dataMin || 0, date.getTime());
			now = now.getTime();
			newMax = mathMin(dataMax || now, now);
		}
		else if (type === 'year') {
			date.setFullYear(date.getFullYear() - count);
			newMin = mathMax(dataMin, date.getTime());
			range = 365 * 24 * 3600 * 1000 * count;
		}
		else if (type === 'all' && baseAxis) {
			newMin = dataMin;
			newMax = dataMax;
		}

		// mark the button pressed
		if (buttons[i]) {
			buttons[i].setState(2);
		}

		// update the chart
		if (!baseAxis) { // axis not yet instanciated
			chart.options.xAxis = merge(
				chart.options.xAxis, {
					//zoomedRange: {
						range: range,
						min: rangeMin
					//}
				}
			);
			selected = i;

		} else { // existing axis object; after render time
			setTimeout(function() { // make sure the visual state is set before the heavy process begins
				baseAxis.setExtremes(
					newMin,
					newMax,
					pick(redraw, 1),
					0
				);
				selected = i;
			}, 1);
		}

	}

	/**
	 * Initialize the range selector
	 */
	function init() {
		chart.extraTopMargin = 25;
		options = chart.options.rangeSelector;
		buttonOptions = options.buttons || defaultButtons;
		selected = options.selected;

		addEvent(container, MOUSEDOWN, function() {

			if (leftBox) {
				leftBox.blur();
			}
			if (rightBox) {
				rightBox.blur();
			}
		});

		// zoomed range based on a pre-selected button index
		if (selected !== UNDEFINED && buttonOptions[selected]) {
			clickButton(selected, buttonOptions[selected], false);
		}

		// normalize the pressed button whenever a new range is selected
		addEvent(chart, 'beforeRender', function() {
			addEvent(chart.xAxis[0], 'setExtremes', function() {
				if (buttons[selected]) {
					buttons[selected].setState(0);
				}
			});
		});
	}


	/**
	 * Set the internal and displayed value of a HTML input for the dates
	 * @param {Object} input
	 * @param {Number} time
	 */
	function setInputValue(input, time) {
		var format = input.hasFocus ? '%Y-%m-%d' : '%b %e, %Y';
		if (time) {
			input.HCTime = time;
		}
		input.value = dateFormat(format, input.HCTime);
	}

	/**
	 * Draw either the 'from' or the 'to' HTML input box of the range selector
	 * @param {Object} name
	 */
	function drawInput(name) {
		var isMin = name === 'min',
			input;

		// create the text label
		createElement('span', {
			innerHTML: lang[isMin ? 'rangeSelectorFrom' : 'rangeSelectorTo']
		}, options.labelStyle, div);

		// create the input element
		input = createElement('input', {
			name: name,
			className: 'highcharts-range-selector',
			type: 'text'
		}, extend({
			width: '80px',
			height: '16px',
			border: '1px solid silver',
			marginLeft: '5px',
			marginRight: isMin ? '5px' : '0',
			textAlign: 'center'
		}, options.inputStyle), div);


		input.onfocus = input.onblur = function(e) {
			e = e || window.event;
			input.hasFocus = e.type === 'focus';
			setInputValue(input);
		};

		input.onchange = function() {
			var value = Date.parse(input.value),
				extremes = chart.xAxis[0].getExtremes();

			if (!isNaN(value) &&
				((isMin && (value > extremes.dataMin && value < rightBox.HCTime)) ||
				(!isMin && (value < extremes.dataMax && value > leftBox.HCTime)))
			) {
				chart.xAxis[0].setExtremes(
					isMin ? value : extremes.min,
					isMin ? extremes.max : value
				);
			}
		};

		return input;
	}

	/**
	 * Render the range selector including the buttons and the inputs. The first time render
	 * is called, the elements are created and positioned. On subsequent calls, they are
	 * moved and updated.
	 * @param {Number} min X axis minimum
	 * @param {Number} max X axis maximum
	 */
	function render(min, max) {
		var chartStyle = chart.options.chart.style,
			buttonTheme = options.buttonTheme,
			inputEnabled = options.inputEnabled !== false,
			states = buttonTheme && buttonTheme.states;

		// create the elements
		if (!rendered) {
			renderer.text(lang.rangeSelectorZoom, chart.plotLeft, chart.plotTop - 10)
				.css(options.labelStyle)
				.add();
			
			each(buttonOptions, function(rangeOptions, i) {
				buttons[i] = renderer.button(
					rangeOptions.text,
					chart.plotLeft + 50 +  i * 30,
					chart.plotTop - 25,
					function() {
						clickButton(i, rangeOptions);
						this.isActive = true;
					},
					extend(buttonTheme, {
						padding: 1,
						r: 0
					}),
					states && states.hover,
					states && states.select
				)
				.attr({
					width: 28
				})
				.css({
					textAlign: 'center'
				})
				.add();

				if (selected === i) {
					buttons[i].setState(2);
				}

			});

			// first create a wrapper outside the container in order to make
			// the inputs work and make export correct
			if (inputEnabled) {
				div = createElement('div', null, {
					position: 'relative',
					height: 0,
					fontFamily: chartStyle.fontFamily,
					fontSize: chartStyle.fontSize
				}, container.parentNode);

				// create an absolutely positionied div to keep the inputs
				div = createElement('div', null, extend({
					position: 'absolute',
					top: (-chart.chartHeight + chart.plotTop - 25) +'px',
					right: (chart.chartWidth - chart.plotLeft - chart.plotWidth) + 'px'
				}, options.inputBoxStyle), div);

				leftBox = drawInput('min');

				rightBox = drawInput('max');
			}
		}

		if (inputEnabled) {
			setInputValue(leftBox, min);
			setInputValue(rightBox, max);
		}


		rendered = true;
	}



	// Run RangeSelector
	init();

	// Expose
	return {
		render: render
	};
}

/* ****************************************************************************
 * End Range Selector code													*
 *****************************************************************************/

addEvent(Chart.prototype, 'init', function(e) {
	var chart = e.target,
		chartOptions = chart.options;

	// initiate the range selector
	if (chartOptions.rangeSelector.enabled) {
		chart.rangeSelector = new RangeSelector(chart);
	}
});
addEvent(Chart.prototype, 'beforeRender', function(e) {
	var chart = e.target,
		chartOptions = chart.options;

	// initiate the scroller
	if (chartOptions.navigator.enabled || chartOptions.scrollbar.enabled) {
		chart.scroller = new Scroller(chart);
	}
});

Chart.prototype.callbacks.push(function(chart) {
	var extremes,
		scroller = chart.scroller,
		rangeSelector = chart.rangeSelector;

	function renderScroller() {
		extremes = chart.xAxis[0].getExtremes();
		scroller.render(
			mathMax(extremes.min, extremes.dataMin),
			mathMin(extremes.max, extremes.dataMax)
		);
	}

	function renderRangeSelector() {
		extremes = chart.xAxis[0].getExtremes();
		rangeSelector.render(extremes.min, extremes.max);
	}

	// initiate the scroller
	if (scroller) {

		// redraw the scroller on setExtremes
		addEvent(chart.xAxis[0], 'setExtremes', function(e) {
			scroller.render(e.min, e.max);
		});

		// redraw the scroller chart resize
		addEvent(chart, 'resize', renderScroller);


		// do it now
		renderScroller();

	}
	if (rangeSelector) {



		// redraw the scroller on setExtremes
		addEvent(chart.xAxis[0], 'setExtremes', function(e) {
			rangeSelector.render(e.min, e.max);
		});

		// redraw the scroller chart resize
		addEvent(chart, 'resize', renderRangeSelector);


		// do it now
		renderRangeSelector();

	}
});
