(function ($, undefined) {
    var chartColor = 'white';
    var headerHeight = 72;
    var verticalMarginHeight = 30;
    var rowHeight = 450;
    /**
     * Reads data from the data.json file and begins to create the visualizations
     */
    function start() {
        $.getJSON('data.json', function (data) {
            // Create every visualization in the dashboard
            checkParams(makePopPyramid, [data.pyramidData]);
            checkParams(makeBoxPlot, [data.boxPlotData]);
            checkParams(makeGenderGroupedBar, ['Patient Race', data.fRaceLabels, data.fRaceValues,
                data.mRaceLabels, data.mRaceValues, 'raceBar', true]);
            checkParams(makeGenderGroupedBar, ['Patient Ethnicity', data.fEthLabels, data.fEthValues,
                data.mEthLabels, data.mEthValues, 'ethBar', true]);
            checkParams(makeMatrix, [data.conditionMatrixLabels, data.conditionMatrixValues]);
            checkParams(makeMedBarChart, [data.medLabels, data.medValues]);
            checkParams(makeResourceCountsTable, [data.resourceLabels, data.resourceCounts, data.tags.concat([''])]);
            checkParams(makeStateMap, [data.states]);
            checkParams(serverOverview, [data.metadata]);
            var mortLabels = ['Alive', 'Deceased'];
            checkParams(makeGenderGroupedBar, ['Patient Mortality', mortLabels,
                data.fAliveArr, mortLabels, data.mAliveArr, 'aliveBar', false]);
            // Resize the Plotly plots and population pyramid when the window is resized horizontally
            var prevWidth = $(window).width();
            window.onresize = function () {
                var currentWidth = $(window).width();
                if (currentWidth === prevWidth)
                    return;
                prevWidth = currentWidth;
                resizePlots('.js-plotly-plot', rowHeight);
                resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
                checkParams(makePopPyramid, [data.pyramidData]);
            };
            resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
            window.setTimeout(function () {
                // Remove the loader animation
                $('#load').remove();
                // Add the timestamp in the left of header
                $('#last-updated').html("<h4 id=\"timestamp\">Last Updated: " + data.metadata.timestamp + "</h4>");
                // Disable mouse events for population map Plotly plot
                $('.geolayer .geo').css('pointer-events', 'none');
            }, 100);
        });
        // Miscellaneous css styling and event handling
        $('#hamburger').click(function () { return $('#wrapper').toggleClass('toggled'); });
        $('#page-title').css('cursor', 'pointer').click(function () { return animateScroll(0); });
        $('.chart-row div').css('height', rowHeight + "px");
        $('.chart-row:not(:first), #raceBar').css('marginBottom', verticalMarginHeight + "px");
        $('#page-content-wrapper').css('paddingTop', headerHeight + "px");
        linkSidebarButton('.sidelink.overview', '#overview-header');
        linkSidebarButton('.sidelink.patient-data', '#patient-header');
    }
    /**
     * Calls the given function if all of the arguments are defined and not empty
     * @param {Function} func the function to call if the arguments are valid
     * @param {Array} args the arguments to check and pass to the given function
     */
    function checkParams(func, args) {
        if (!args.every(function (arg) { return typeof arg !== 'undefined'
            && (arg.constructor !== Array || arg.length > 0); })) {
            console.log("Error: not all parameters are valid for the '" + func.name + "' function.");
            return;
        }
        func.apply(void 0, args);
    }
    /**
     * Creates the population pyramid visualization (using d3)
     * @param {Object[]} pyramidData the data needed to make the population pyramid
     */
    function makePopPyramid(pyramidData) {
        var margin = { top: 70, right: 30, bottom: 50, left: 30, middle: 20 };
        var pyramidHeight = rowHeight - margin.top - margin.bottom;
        var pyramidWidth = $('#popPyramid').width() - margin.right - margin.left;
        var barRegionWidth = pyramidWidth / 2 - margin.middle;
        var yAxisLeftX = barRegionWidth;
        var yAxisRightX = pyramidWidth - barRegionWidth;
        var translation = function (xPoint, yPoint) { return "translate(" + xPoint + "," + yPoint + ")"; };
        var popPyramid = d3.select('#popPyramid');
        var svg = popPyramid
            .attr('class', 'panel panel-default')
            .html('')
            .attr('width', '100%')
            .attr('height', rowHeight + "px")
            .append('svg')
            .attr('width', margin.left + pyramidWidth + margin.right)
            .attr('height', margin.top + pyramidHeight + margin.bottom)
            .style('background-color', 'white')
            .style('display', 'block')
            .style('margin', 'auto')
            .append('g')
            .attr('transform', translation(margin.left, margin.top));
        function makePyramidLabel(text, yPoint, divisor) {
            var label = popPyramid.select('svg').append('text')
                .attr('y', yPoint)
                .style('font-family', 'sans-serif')
                .style('font-size', text === 'Patient Population' ? '18px' : '11px')
                .text(text);
            var textWidth = label.node().getComputedTextLength();
            return label.attr('x', pyramidWidth / divisor - textWidth / 2 + margin.left);
        }
        var totalMales = d3.sum(pyramidData, function (datum) { return datum.male; });
        var totalFemales = d3.sum(pyramidData, function (datum) { return datum.female; });
        var percentageOfTotalPop = function (datum) { return datum / (totalMales + totalFemales); };
        var xAxisLabelYPoint = popPyramid.select('svg').attr('height') - 13;
        makePyramidLabel('Patient Population', 30, 2);
        makePyramidLabel('Percent of Total Population', xAxisLabelYPoint, 2);
        makePyramidLabel('Age', 60, 2);
        makePyramidLabel("Male Population: " + totalMales, 60, 4);
        makePyramidLabel("Female Population: " + totalFemales, 60, 1.25);
        var maxDataValue = Math.max(d3.max(pyramidData, function (datum) { return percentageOfTotalPop(datum.male); }), d3.max(pyramidData, function (datum) { return percentageOfTotalPop(datum.female); }));
        // Ensure that axis labels do not overlap
        var tickFormat = d3.format((maxDataValue >= 0.1) ? '.0%' : '.1%');
        var tickNum = 5;
        var xScale = d3.scaleLinear().domain([0, maxDataValue]).range([0, barRegionWidth]).nice();
        var yScale = d3.scaleBand().domain(pyramidData.map(function (datum) { return datum.group; }))
            .rangeRound([pyramidHeight, 0], 0.1);
        var yAxisLeft = d3.axisRight().scale(yScale).tickSize(4, 0).tickPadding(margin.middle - 4);
        var yAxisRight = d3.axisLeft().scale(yScale).tickSize(4, 0).tickFormat('');
        var xAxisRight = d3.axisBottom().scale(xScale).tickFormat(tickFormat).ticks(tickNum);
        var xAxisLeft = d3.axisBottom().scale(xScale.copy().range([yAxisLeftX, 0]))
            .tickFormat(tickFormat).ticks(tickNum);
        // scale(-1,1) is used to reverse the left (male) bars
        var rightBars = svg.append('g').attr('transform', translation(yAxisRightX, 0));
        var leftBars = svg.append('g').attr('transform', translation(yAxisLeftX, 0) + "scale(-1,1)");
        function appendAxis(type, trans, axisToCall) {
            return svg.append('g').attr('class', "axis " + type)
                .attr('transform', trans).call(axisToCall);
        }
        appendAxis('y left', translation(yAxisLeftX, 0), yAxisLeft)
            .selectAll('text').style('text-anchor', 'middle');
        appendAxis('y right', translation(yAxisRightX, 0), yAxisRight);
        appendAxis('x left', translation(0, pyramidHeight), xAxisLeft);
        appendAxis('x right', translation(yAxisRightX, pyramidHeight), xAxisRight);
        function drawBars(group, selector, widthFunc, fill) {
            group.selectAll(".bar." + selector)
                .data(pyramidData).enter()
                .append('rect')
                .attr('class', "bar " + selector)
                .attr('x', 0)
                .attr('y', function (datum) { return yScale(datum.group); })
                .attr('width', widthFunc)
                .attr('height', yScale.bandwidth())
                .attr('fill', fill)
                .attr('stroke', chartColor)
                .attr('stroke-width', 2)
                .attr('numLabel', createBarNumLabels)
                .style('fill-opacity', 0.5);
        }
        drawBars(leftBars, 'left', function (datum) { return xScale(percentageOfTotalPop(datum.male)); }, 'steelblue');
        drawBars(rightBars, 'right', function (datum) { return xScale(percentageOfTotalPop(datum.female)); }, 'firebrick');
        // Creates a number label for each bar in the pyramid
        function createBarNumLabels(datum, id) {
            var bar = d3.select(this);
            var gender = bar.attr('class') === 'bar left' ? 'male' : 'female';
            var label = svg.append('text')
                .attr('fill', bar.attr('fill'))
                .style('font-size', '11px')
                .attr('y', function () { return yScale(datum.group) + yScale.bandwidth() * 2 / 3; });
            if (bar.attr('class') === 'bar right') {
                label.attr('x', yAxisRightX + xScale(percentageOfTotalPop(datum.female)) + 3)
                    .text([datum.female]);
            }
            else {
                label.text([datum.male]);
                var textWidth = label.node().getComputedTextLength() + 3;
                label.attr('x', yAxisLeftX - xScale(percentageOfTotalPop(datum.male)) - textWidth);
            }
            return 'success';
        }
    }
    /**
     * Creates the patient population map visualization (using Plotly)
     * @param {Object} states the data needed to make the patient population map
     */
    function makeStateMap(states) {
        var title = 'Patient Population by State';
        var stateLabels = Object.keys(states);
        var data = [{
                type: 'choropleth',
                locationmode: 'USA-states',
                locations: stateLabels,
                z: stateLabels.map(function (key) { return states[key]; }),
                colorscale: [[0, 'rgb(242,240,247)'], [1, 'rgb(84,39,143)']],
                colorbar: { thickness: 10 }
            }];
        var stateMapLayout = {
            margin: { b: 50, t: 50 },
            geo: {
                scope: 'usa',
                showland: true,
                landcolor: 'rgb(217, 217, 217)',
                subunitcolor: 'rgb(255, 255, 255)'
            }
        };
        stateMapLayout = makePlotLayout(title, stateMapLayout);
        stylePlot('#stateMap').on('plotly_relayout', truncateLabels);
        Plotly.plot('stateMap', data, stateMapLayout, { displayModeBar: false });
    }
    /**
     * Creates the condition co-morbidity matrix visualization (using Plotly)
     * @param {String[]} conditionMatrixLabels the labels for the matrix
     * @param {Number[][]} conditionMatrixValues the values for the matrix
     */
    function makeMatrix(conditionMatrixLabels, conditionMatrixValues) {
        var title = 'Condition Co-Morbidity Matrix';
        var yLabels = conditionMatrixLabels.slice().reverse();
        var reversedValues = conditionMatrixValues.slice().reverse();
        var data = [{
                x: conditionMatrixLabels,
                y: yLabels,
                z: reversedValues,
                type: 'heatmap',
                colorscale: [[0, '#b7e4ff'], [1, '#0865a0']],
                showscale: false
            }];
        var tickfont = {
            size: 11,
            color: 'black'
        };
        var matrixLayout = {
            margin: { l: 110, t: 140, r: 10, b: 10 },
            annotations: [],
            xaxis: {
                ticks: '',
                side: 'top',
                tickangle: 30,
                tickfont: tickfont
            },
            yaxis: {
                ticks: '',
                ticksuffix: ' ',
                autosize: false,
                tickfont: tickfont
            }
        };
        matrixLayout = makePlotLayout(title, matrixLayout);
        // Create annotation (pop-up label on hover) for each box in matrix
        conditionMatrixLabels.forEach(function (label1, ind1) {
            conditionMatrixLabels.forEach(function (label2, ind2) {
                var result = {
                    x: conditionMatrixLabels[ind2],
                    y: yLabels[ind1],
                    text: reversedValues[ind1][ind2],
                    font: {
                        family: 'sans-serif',
                        size: 12,
                        color: 'white'
                    },
                    showarrow: false
                };
                matrixLayout.annotations.push(result);
            });
        });
        stylePlot('#matrix');
        Plotly.newPlot('matrix', data, matrixLayout, { displayModeBar: false });
    }
    /**
     * Creates a bar chart with a group for each gender (using Plotly)
     * @param {String} title the title of the bar chart
     * @param {String[]} fLabels the female labels for the x-axis
     * @param {Number[]} fCounts the female values for each label
     * @param {String[]} mLabels the male labels for the x-axis
     * @param {Number[]} mCounts the male values for each label
     * @param {String} divID the div to insert the graph into
     * @param {Boolean} isHalfHeight determines whether the chart is half as tall as other charts
     */
    function makeGenderGroupedBar(title, fLabels, fCounts, mLabels, mCounts, divID, isHalfHeight) {
        var makeTrace = function (labels, counts, name, color) { return ({
            x: labels,
            y: counts,
            type: 'bar',
            marker: { color: color },
            name: name
        }); };
        var fTrace = makeTrace(fLabels, fCounts, 'Female', 'rgb(230,127,127)');
        var mTrace = makeTrace(mLabels, mCounts, 'Male', 'rgb(145,182,212)');
        var data = (mCounts[0] > fCounts[0]) ? [mTrace, fTrace] : [fTrace, mTrace];
        var barLayout = {
            barmode: 'group',
            margin: { t: 50 },
            yaxis: {
                title: 'Number of Patients',
                titlefont: {
                    size: 17
                }
            }
        };
        barLayout = makePlotLayout(title, barLayout);
        stylePlot("#" + divID, isHalfHeight).on('plotly_relayout', truncateLabels);
        Plotly.newPlot(divID, data, barLayout, { displayModeBar: false });
    }
    /**
     * Creates the resource counts table
     * @param {String[]} resourceLabels the labels for the table (the far-left column)
     * @param {String[][]} resourceCounts the values for the table (each inner array is a column)
     * @param {String[]} tagOrder the order of columns (only used if the user provided tags)
     */
    function makeResourceCountsTable(resourceLabels, resourceCounts, tagOrder) {
        var columnTitles = ['Resource'];
        for (var i = 0; i < resourceCounts.length; i++) {
            var columnTitle = resourceCounts[i][resourceCounts[i].length - 1];
            if (i < resourceCounts.length - 1 && columnTitle !== tagOrder[i]) {
                resourceCounts.push(resourceCounts.splice(i, 1)[0]);
                i -= 1;
                continue;
            }
            columnTitles.push(columnTitle);
        }
        var table = d3.select('#resourceTable')
            .append('table')
            .attr('class', 'table table-hover panel panel-default')
            .style('marginBottom', 0)
            .style('height', '100%');
        var tableHead = table.append('thead').append('tr');
        columnTitles.forEach(function (title) {
            tableHead.append('th').text(title);
        });
        // Table has two bodies, one that is always shown and one that can be expanded/collapsed
        var tbody = table.append('tbody');
        var toggleTbody = table.append('tbody')
            .attr('id', 'toggleTable').style('display', 'none').style('border-top-width', 0);
        var collapsedHeight = rowHeight / 50 - 1;
        resourceLabels.forEach(function (label, index) {
            var tableRow = (index > collapsedHeight ? toggleTbody : tbody).append('tr');
            tableRow.append('td').text(label);
            resourceCounts.forEach(function (column) {
                tableRow.append('td').text(column[index]);
            });
        });
        if (resourceCounts[0].length - 1 <= collapsedHeight)
            return;
        // Creates a button that expands/collapses the second table body when clicked
        table.append('button').attr('type', 'button').attr('class', 'btn btn-info')
            .attr('id', 'toggleButton').text('Expand').style('margin', '0 auto');
        var tbodySize = function (body) { return body.selectAll('tr').size(); };
        var hiddenRowsSize = tbodySize(toggleTbody) + 1;
        var $button = $('#toggleButton');
        var $table = $('#resourceTable');
        var $toggleTable = $('#toggleTable');
        var $parentRow = $($table.parents('.chart-row')[0]);
        $button.click(function () {
            if ($button.text() === 'Expand') {
                if ($table.css('overflow') === 'scroll')
                    $table.css('overflow', 'visible');
                $toggleTable.slideDown(0);
                var tableHeight = table.node().getBoundingClientRect().height;
                $parentRow.css('marginBottom', tableHeight - rowHeight + "px");
            }
            else {
                if ($table.css('overflow') == 'visible')
                    $table.css('overflow', 'scroll');
                animateScroll($table.offset().top - headerHeight);
                $toggleTable.slideUp('slow', function () {
                    $parentRow.css('marginBottom', 0);
                });
            }
            $button.text(function () { return $button.text() === 'Expand' ? 'Collapse' : 'Expand'; });
        });
    }
    /**
     * Creates the medication bar chart (using Plotly)
     * @param {String[]} labels the labels for the x-axis
     * @param {Number[]} values the value for each label
     */
    function makeMedBarChart(labels, values) {
        if (labels.every(function (el) { return el === null; }) || values.every(function (el) { return el === null; }))
            return;
        var title = "Top " + values.length + " Prescribed Medications";
        var data = [{
                x: labels,
                y: values,
                type: 'bar'
            }];
        var barLayout = {
            margin: { t: 140, b: 100, l: 60, r: 60 }
        };
        barLayout = makePlotLayout(title, barLayout);
        stylePlot('#meds');
        Plotly.newPlot('meds', data, barLayout, { displayModeBar: false });
    }
    /**
     * Creates the box plots visualization (using Plotly)
     * @param {any} boxData the data needed to make the box plots
     */
    function makeBoxPlot(boxData) {
        if (boxData.length === 0)
            return;
        // Creates multiple box plots in the same visualization
        var traces = [];
        boxData.forEach(function (datum) {
            traces.push({
                name: datum.resource,
                x: datum.data,
                type: 'box',
                boxpoints: false
            });
        });
        var boxLayout = {
            margin: { l: 100, r: 30, b: 30, t: 40 },
            showlegend: false
        };
        boxLayout = makePlotLayout('Number of Resources Per Patient', boxLayout);
        stylePlot('#boxes', true).on('plotly_relayout', truncateLabels);
        Plotly.newPlot('boxes', traces, boxLayout, { displayModeBar: false });
    }
    /**
     * Styles the parent div of a plot before the insertion of the plot into the div
     * @param {String} selector the selector of the parent div of the plot
     * @param {Boolean} [isHalfHeight=false] determines if the chart is half as tall as other charts
     * @returns {Object} the parent div (jQuery object)
     */
    function stylePlot(selector, isHalfHeight) {
        if (isHalfHeight === void 0) { isHalfHeight = false; }
        return $(selector)
            .attr('class', ((isHalfHeight ? 'half-height ' : '') + "panel panel-default"))
            .css('width', '100%').css('height', rowHeight + "px")
            .css('overflow', 'hidden').css('background-color', 'white');
    }
    /**
     * Resizes all of the Plotly plots with the class 'className'
     * @param {String} className selects which plots to resize
     * @param {Number} plotHeight the height to set the plots to
     */
    function resizePlots(className, plotHeight) {
        var plotsToResize = Plotly.d3.selectAll(className)
            .style('width', '100%').style('height', plotHeight + "px")[0]
            .forEach(function (node) { return Plotly.Plots.resize(node); });
    }
    /**
     * Creates the server overview table
     * @param {Object} overviewData the data needed to make the overview table
     */
    function serverOverview(overviewData) {
        var tableBody = d3.select('#metadata')
            .attr('class', 'half-height panel panel-default')
            .style('background-color', 'white')
            .style('overflow-x', 'scroll')
            .style('marginBottom', verticalMarginHeight + "px !important") // panel marginBottom overrides this
            .style('height', (rowHeight - verticalMarginHeight) / 2 + "px")
            .append('table')
            .attr('class', 'table table-hover table-condensed')
            .style('height', '100%')
            .append('tbody');
        function addTableRow(tableBody, infoArr) {
            var tableRow = tableBody.append('tr');
            infoArr.forEach(function (info) {
                tableRow.append('td').html(info);
            });
        }
        var getGlyph = function (bool) { return "<span class=\"glyphicon glyphicon-" + (bool ? 'ok' : 'remove') + "\" aria-hidden=\"true\"></span>"; };
        addTableRow(tableBody, ['Server URL', "<a target=\"_blank\" href=\"" + overviewData.url + "\">" + overviewData.url + "</a>"]);
        addTableRow(tableBody, ['FHIR Version', overviewData.fhirVersion]);
        addTableRow(tableBody, ['Supports JSON', getGlyph(overviewData.supports.json)]);
        addTableRow(tableBody, ['Supports XML', getGlyph(overviewData.supports.xml)]);
        addTableRow(tableBody, ['Supports SMART-on-FHIR', getGlyph(overviewData.supports.smartOnFhir)]);
    }
    /**
     * Creates the layout for a Plotly plot
     * @param {String} title the title of the plot
     * @param {Object} layout any layout configurations that are specific to this plot
     */
    function makePlotLayout(title, layout) {
        var layoutCopy = JSON.parse(JSON.stringify(layout));
        layoutCopy.font = { family: 'sans-serif' };
        layoutCopy.title = title;
        return layoutCopy;
        // (<any>Object).assign({ font: { family: 'sans-serif', }, title, }, layout);
    }
    /**
     * Returns an animation for the screen to vertically scroll to a given point
     * @param {Number} yPoint the y-coordinate of the point to scroll to
     */
    var animateScroll = function (yPoint) { return $('html, body').animate({ scrollTop: yPoint }, 'slow'); };
    /**
     * Truncates a string to a given length if the string is longer than the given length
     * @param {String} str the string to truncate
     * @param {Number} maxLen the maximum length of the string to return
     * @returns {String} the truncated string (with string.length <= maxLen)
     */
    function truncateString(str, maxLen) {
        var trimStr = str.trim();
        return (trimStr.length > maxLen) ? trimStr.substr(0, maxLen - 3).trim() + "..." : trimStr;
    }
    /**
     * Truncates the labels in the condition matrix, the medication bar chart, and the box plots
     */
    function truncateLabels() {
        $('#matrix, #meds, #boxes').find('.xtick > text, .ytick > text')
            .text(function (index, str) { return truncateString(str, 15) + " "; });
    }
    /**
     * Connects a button on the sidebar to an element on the page to scroll to
     * @param {String} sideButton the selector for the button on the sidebar
     * @param {String} element the selector for the element to scroll to
     */
    function linkSidebarButton(sideButton, element) {
        $(sideButton).click(function () { return animateScroll($(element).offset().top - headerHeight); });
    }
    // Run ==================================================================================
    $(start);
})(jQuery);
