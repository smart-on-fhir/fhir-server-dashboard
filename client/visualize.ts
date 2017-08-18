declare var d3, jQuery, Plotly, document: Document, window: Window, console: Console, MouseEvent: { new(typeArg: string, eventInitDict?: MouseEventInit): MouseEvent; prototype: MouseEvent; };
(function ($, undefined) {
    const chartColor = 'white';
    const headerHeight = 72;
    const verticalMarginHeight = 30;
    const rowHeight = 450;

    /**
     * Reads data from the data.json file (or the given local file in the url of the dashboard
     * from the parameter 'file', e.g. dashboard-url.com?file=otherData.json) and begins to
     * create the visualizations
     */
    function start() {
        let dataFile = 'data.json';

        // Checks for a given data file in the url
        const param = getQueryVariable('file');
        if (param) {
            const file = param.substr(param.length - 5) === '.json' ? param : `${param}.json`;

            if (file.indexOf('/') < 0 && file.indexOf('..') < 0) {
                dataFile = file;
            }
        }

        // Gets the JSON from a local file and passes it to a handler function
        $.getJSON(dataFile)
            .then((data) => data,
            () => {
                console.error('Failed to load the specified JSON file');
                return $.getJSON('data.json');
            }
            ).always(handleJSON);

        // Miscellaneous css styling and event handling
        $('#hamburger').click(() => $('#wrapper').toggleClass('toggled'));
        $('#page-title').css('cursor', 'pointer').click(() => animateScroll(0));
        $('.chart-row div').css('height', `${rowHeight}px`);
        $('.chart-row:not(:first), #raceBar').css('marginBottom', `${verticalMarginHeight}px`);
        $('#page-content-wrapper').css('paddingTop', `${headerHeight}px`);
        linkSidebarButton('.sidelink.overview', '#overview-header');
        linkSidebarButton('.sidelink.patient-data', '#patient-header');
    }

    /**
     * Handles the JSON from a local file and creates the dashboard's visualizations
     * @param {Object} data the data from a local file that contains aggregated data from a server
     */
    function handleJSON(data) {
        // Create every visualization in the dashboard
        checkParams(makePopPyramid, [data.pyramidData]);
        checkParams(makeBoxPlot, [data.boxPlotData]);
        checkParams(makeGenderGroupedBar,
            ['Patient Race', data.fRaceLabels, data.fRaceValues,
                data.mRaceLabels, data.mRaceValues, 'raceBar', true]);
        checkParams(makeGenderGroupedBar,
            ['Patient Ethnicity', data.fEthLabels, data.fEthValues,
                data.mEthLabels, data.mEthValues, 'ethBar', true]);
        checkParams(makeMatrix,
            [data.conditionMatrixLabels, data.conditionMatrixValues]);
        checkParams(makeMedBarChart,
            [data.medLabels, data.medValues]);
        checkParams(makeResourceCountsTable,
            [data.resourceLabels, data.resourceCounts, data.tags.concat([''])]);
        checkParams(makeStateMap, [data.states]);
        checkParams(serverOverview, [data.metadata]);

        const mortLabels = ['Alive', 'Deceased'];
        checkParams(makeGenderGroupedBar, ['Patient Mortality', mortLabels,
            data.fAliveArr, mortLabels, data.mAliveArr, 'aliveBar', false]);

        // Resize the Plotly plots and population pyramid when the window is resized horizontally
        let prevWidth = $(window).width();
        window.onresize = () => {
            const currentWidth = $(window).width();
            if (currentWidth === prevWidth) return;
            prevWidth = currentWidth;
            resizePlots('.js-plotly-plot', rowHeight);
            resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);
            checkParams(makePopPyramid, [data.pyramidData]);
        };
        resizePlots('.half-height', (rowHeight - verticalMarginHeight) / 2);

        window.setTimeout(() => {
            // Remove the loader animation
            $('#load').remove();

            // Add the timestamp in the left of header
            $('#last-updated').html(`<h4 id="timestamp">Last Updated: ${data.metadata.timestamp}</h4>`);

            // Disable mouse events for population map Plotly plot
            $('.geolayer .geo').css('pointer-events', 'none');
        }, 100);
    }

    /**
     * Calls the given function if all of the arguments are defined and not empty
     * @param {Function} func the function to call if the arguments are valid
     * @param {Array} args the arguments to check and pass to the given function
     */
    function checkParams(func, args) {
        if (!args.every(arg => typeof arg !== 'undefined'
            && (arg.constructor !== Array || arg.length > 0))) {
            console.error(`Error: not all parameters are valid for the '${func.name}' function.`);
            return;
        }
        func(...args);
    }

    /**
     * Creates the population pyramid visualization (using d3)
     * @param {Object[]} pyramidData the data needed to make the population pyramid
     */
    function makePopPyramid(pyramidData) {
        const margin = { top: 70, right: 30, bottom: 50, left: 30, middle: 20, };
        const pyramidHeight = rowHeight - margin.top - margin.bottom;
        const pyramidWidth = $('#popPyramid').width() - margin.right - margin.left;
        const barRegionWidth = pyramidWidth / 2 - margin.middle;
        const yAxisLeftX = barRegionWidth;
        const yAxisRightX = pyramidWidth - barRegionWidth;

        const translation = (xPoint, yPoint) => `translate(${xPoint},${yPoint})`;

        const popPyramid = d3.select('#popPyramid');
        const svg = popPyramid
            .attr('class', 'panel panel-default')
            .html('')
            .attr('width', '100%')
            .attr('height', `${rowHeight}px`)
            .append('svg')
            .attr('width', margin.left + pyramidWidth + margin.right)
            .attr('height', margin.top + pyramidHeight + margin.bottom)
            .style('background-color', 'white')
            .style('display', 'block')
            .style('margin', 'auto')
            .append('g')
            .attr('transform', translation(margin.left, margin.top));

        function makePyramidLabel(text, yPoint, divisor) {
            const label = popPyramid.select('svg').append('text')
                .attr('y', yPoint)
                .style('font-family', 'sans-serif')
                .style('font-size', text === 'Patient Population' ? '18px' : '11px')
                .text(text);
            const textWidth = label.node().getComputedTextLength();
            return label.attr('x', pyramidWidth / divisor - textWidth / 2 + margin.left);
        }

        const totalMales = d3.sum(pyramidData, datum => datum.male);
        const totalFemales = d3.sum(pyramidData, datum => datum.female);
        const percentageOfTotalPop = datum => datum / (totalMales + totalFemales);

        const xAxisLabelYPoint = popPyramid.select('svg').attr('height') - 13;
        makePyramidLabel('Patient Population', 30, 2);
        makePyramidLabel('Percent of Total Population', xAxisLabelYPoint, 2);
        makePyramidLabel('Age', 60, 2);
        makePyramidLabel(`Male Population: ${totalMales}`, 60, 4);
        makePyramidLabel(`Female Population: ${totalFemales}`, 60, 1.25);

        const maxDataValue = Math.max(
            d3.max(pyramidData, datum => percentageOfTotalPop(datum.male)),
            d3.max(pyramidData, datum => percentageOfTotalPop(datum.female))
        );

        // Ensure that axis labels do not overlap
        const tickFormat = d3.format((maxDataValue >= 0.1) ? '.0%' : '.1%');
        const tickNum = 5;

        const xScale = d3.scaleLinear().domain([0, maxDataValue]).range([0, barRegionWidth]).nice();
        const yScale = d3.scaleBand().domain(pyramidData.map(datum => datum.group))
            .rangeRound([pyramidHeight, 0], 0.1);

        const yAxisLeft = d3.axisRight().scale(yScale).tickSize(4, 0).tickPadding(margin.middle - 4);
        const yAxisRight = d3.axisLeft().scale(yScale).tickSize(4, 0).tickFormat('');
        const xAxisRight = d3.axisBottom().scale(xScale).tickFormat(tickFormat).ticks(tickNum);
        const xAxisLeft = d3.axisBottom().scale(xScale.copy().range([yAxisLeftX, 0]))
            .tickFormat(tickFormat).ticks(tickNum);

        // scale(-1,1) is used to reverse the left (male) bars
        const rightBars = svg.append('g').attr('transform', translation(yAxisRightX, 0));
        const leftBars = svg.append('g').attr('transform', `${translation(yAxisLeftX, 0)}scale(-1,1)`);

        function appendAxis(type, trans, axisToCall) {
            return svg.append('g').attr('class', `axis ${type}`)
                .attr('transform', trans).call(axisToCall);
        }

        appendAxis('y left', translation(yAxisLeftX, 0), yAxisLeft)
            .selectAll('text').style('text-anchor', 'middle');
        appendAxis('y right', translation(yAxisRightX, 0), yAxisRight);
        appendAxis('x left', translation(0, pyramidHeight), xAxisLeft);
        appendAxis('x right', translation(yAxisRightX, pyramidHeight), xAxisRight);

        function drawBars(group, selector, widthFunc, fill) {
            group.selectAll(`.bar.${selector}`)
                .data(pyramidData).enter()
                .append('rect')
                .attr('class', `bar ${selector}`)
                .attr('x', 0)
                .attr('y', datum => yScale(datum.group))
                .attr('width', widthFunc)
                .attr('height', yScale.bandwidth())
                .attr('fill', fill)
                .attr('stroke', chartColor)
                .attr('stroke-width', 2)
                .attr('numLabel', createBarNumLabels)
                .style('fill-opacity', 0.5);
        }

        drawBars(leftBars, 'left', datum => xScale(percentageOfTotalPop(datum.male)), 'steelblue');
        drawBars(rightBars, 'right', datum => xScale(percentageOfTotalPop(datum.female)), 'firebrick');

        // Creates a number label for each bar in the pyramid
        function createBarNumLabels(datum, id) {
            const bar = d3.select(this);
            const gender = bar.attr('class') === 'bar left' ? 'male' : 'female';
            const label = svg.append('text')
                .attr('fill', bar.attr('fill'))
                .style('font-size', '11px')
                .attr('y', () => yScale(datum.group) + yScale.bandwidth() * 2 / 3);

            if (bar.attr('class') === 'bar right') {
                label.attr('x', yAxisRightX + xScale(percentageOfTotalPop(datum.female)) + 3)
                    .text([datum.female]);
            } else {
                label.text([datum.male]);
                const textWidth = label.node().getComputedTextLength() + 3;
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
        const title = 'Patient Population by State';
        const stateLabels = Object.keys(states);
        const data = [{
            type: 'choropleth',
            locationmode: 'USA-states',
            locations: stateLabels,
            z: stateLabels.map(key => states[key]),
            colorscale: [[0, 'rgb(242,240,247)'], [1, 'rgb(84,39,143)']],
            colorbar: { thickness: 10, },
        }];

        let stateMapLayout = {
            margin: { b: 50, t: 50, },
            geo: {
                scope: 'usa',
                showland: true,
                landcolor: 'rgb(217, 217, 217)',
                subunitcolor: 'rgb(255, 255, 255)',
            },
        };
        stateMapLayout = makePlotLayout(title, stateMapLayout);


        stylePlot('#stateMap').on('plotly_relayout', truncateLabels);
        Plotly.plot('stateMap', data, stateMapLayout, { displayModeBar: false, });
    }

    /**
     * Creates the condition co-morbidity matrix visualization (using Plotly)
     * @param {String[]} conditionMatrixLabels the labels for the matrix
     * @param {Number[][]} conditionMatrixValues the values for the matrix
     */
    function makeMatrix(conditionMatrixLabels, conditionMatrixValues) {
        const title = 'Condition Co-Morbidity Matrix';
        const yLabels = conditionMatrixLabels.slice().reverse();
        const reversedValues = conditionMatrixValues.slice().reverse();

        const data = [{
            x: conditionMatrixLabels,
            y: yLabels,
            z: reversedValues,
            type: 'heatmap',
            colorscale: [[0, '#b7e4ff'], [1, '#0865a0']],
            showscale: false,
        }];

        const tickfont = {
            size: 11,
            color: 'black',
        };
        let matrixLayout = {
            margin: { l: 110, t: 140, r: 10, b: 10, },
            annotations: [],
            xaxis: {
                ticks: '',
                side: 'top',
                tickangle: 30,
                tickfont,
            },
            yaxis: {
                ticks: '',
                ticksuffix: ' ',
                autosize: false,
                tickfont,
            },
        };
        matrixLayout = makePlotLayout(title, matrixLayout);

        // Create annotation (pop-up label on hover) for each box in matrix
        conditionMatrixLabels.forEach((label1, ind1) => {
            conditionMatrixLabels.forEach((label2, ind2) => {
                const result = {
                    x: conditionMatrixLabels[ind2],
                    y: yLabels[ind1],
                    text: reversedValues[ind1][ind2],
                    font: {
                        family: 'sans-serif',
                        size: 12,
                        color: 'white',
                    },
                    showarrow: false,
                };
                matrixLayout.annotations.push(result);
            });
        });
        stylePlot('#matrix');
        Plotly.newPlot('matrix', data, matrixLayout, { displayModeBar: false, });
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
        const makeTrace = (labels, counts, name, color) => ({
            x: labels,
            y: counts,
            type: 'bar',
            marker: { color, },
            name,
        });
        const fTrace = makeTrace(fLabels, fCounts, 'Female', 'rgb(230,127,127)');
        const mTrace = makeTrace(mLabels, mCounts, 'Male', 'rgb(145,182,212)');
        const data = (mCounts[0] > fCounts[0]) ? [mTrace, fTrace] : [fTrace, mTrace];

        let barLayout = {
            barmode: 'group',
            margin: { t: 50, },
            yaxis: {
                title: 'Number of Patients',
                titlefont: {
                    size: 17,
                },
            },
        };
        barLayout = makePlotLayout(title, barLayout);

        stylePlot(`#${divID}`, isHalfHeight).on('plotly_relayout', truncateLabels);
        Plotly.newPlot(divID, data, barLayout, { displayModeBar: false, });
    }

    /**
     * Creates the resource counts table
     * @param {String[]} resourceLabels the labels for the table (the far-left column)
     * @param {String[][]} resourceCounts the values for the table (each inner array is a column)
     * @param {String[]} tagOrder the order of columns (only used if the user provided tags)
     */
    function makeResourceCountsTable(resourceLabels, resourceCounts, tagOrder) {
        const columnTitles = ['Resource'];
        for (let i = 0; i < resourceCounts.length; i++) {
            const columnTitle = resourceCounts[i][resourceCounts[i].length - 1];
            if (i < resourceCounts.length - 1 && columnTitle !== tagOrder[i]) {
                resourceCounts.push(resourceCounts.splice(i, 1)[0]);
                i -= 1;
                continue;
            }
            columnTitles.push(columnTitle);
        }

        const table = d3.select('#resourceTable')
            .append('table')
            .attr('class', 'table table-hover panel panel-default')
            .style('marginBottom', 0)
            .style('height', '100%');

        const tableHead = table.append('thead').append('tr');

        columnTitles.forEach((title) => {
            tableHead.append('th').text(title);
        });

        // Table has two bodies, one that is always shown and one that can be expanded/collapsed
        const tbody = table.append('tbody');
        const toggleTbody = table.append('tbody')
            .attr('id', 'toggleTable').style('display', 'none').style('border-top-width', 0);
        const collapsedHeight = rowHeight / 50 - 1;
        resourceLabels.forEach((label, index) => {
            const tableRow = (index > collapsedHeight ? toggleTbody : tbody).append('tr');
            tableRow.append('td').text(label);
            resourceCounts.forEach((column) => {
                tableRow.append('td').text(column[index]);
            });
        });
        if (resourceCounts[0].length - 1 <= collapsedHeight) return;

        // Creates a button that expands/collapses the second table body when clicked
        table.append('button').attr('type', 'button').attr('class', 'btn btn-info')
            .attr('id', 'toggleButton').text('Expand').style('margin', '0 auto');

        const tbodySize = (body) => body.selectAll('tr').size();
        const hiddenRowsSize = tbodySize(toggleTbody) + 1;
        const $button = $('#toggleButton');
        const $table = $('#resourceTable');
        const $toggleTable = $('#toggleTable');
        const $parentRow = $($table.parents('.chart-row')[0]);
        $button.click(() => {
            if ($button.text() === 'Expand') {
                if ($table.css('overflow') === 'scroll') $table.css('overflow', 'visible');
                $toggleTable.slideDown(0);
                const tableHeight = table.node().getBoundingClientRect().height;
                $parentRow.css('marginBottom', `${tableHeight - rowHeight}px`);
            } else {
                if ($table.css('overflow') == 'visible') $table.css('overflow', 'scroll');
                animateScroll($table.offset().top - headerHeight);
                $toggleTable.slideUp('slow', () => {
                    $parentRow.css('marginBottom', 0);
                });
            }
            $button.text(() => $button.text() === 'Expand' ? 'Collapse' : 'Expand');
        });
    }

    /**
     * Creates the medication bar chart (using Plotly)
     * @param {String[]} labels the labels for the x-axis
     * @param {Number[]} values the value for each label
     */
    function makeMedBarChart(labels, values) {
        if (labels.every((el) => el === null) || values.every((el) => el === null)) return;
        const title = `Top ${values.length} Prescribed Medications`;
        const data = [{
            x: labels,
            y: values,
            type: 'bar',
        }];
        let barLayout = {
            margin: { t: 140, b: 100, l: 60, r: 60, },
        };
        barLayout = makePlotLayout(title, barLayout);
        stylePlot('#meds');
        Plotly.newPlot('meds', data, barLayout, { displayModeBar: false, });
    }

    /**
     * Creates the box plots visualization (using Plotly)
     * @param {any} boxData the data needed to make the box plots
     */
    function makeBoxPlot(boxData) {
        if (boxData.length === 0) return;

        // Creates multiple box plots in the same visualization
        const traces = [];
        boxData.forEach((datum) => {
            traces.push({
                name: datum.resource,
                x: datum.data,
                type: 'box',
                boxpoints: false,
            });
        });

        let boxLayout = {
            margin: { l: 100, r: 30, b: 30, t: 40, },
            showlegend: false,
        };
        boxLayout = makePlotLayout('Number of Resources Per Patient', boxLayout);
        stylePlot('#boxes', true).on('plotly_relayout', truncateLabels);
        Plotly.newPlot('boxes', traces, boxLayout, { displayModeBar: false, });
    }

    /**
     * Styles the parent div of a plot before the insertion of the plot into the div
     * @param {String} selector the selector of the parent div of the plot
     * @param {Boolean} [isHalfHeight=false] determines if the chart is half as tall as other charts
     * @returns {Object} the parent div (jQuery object)
     */
    function stylePlot(selector, isHalfHeight = false) {
        return $(selector)
            .attr('class', (`${(isHalfHeight ? 'half-height ' : '')}panel panel-default`))
            .css('width', '100%').css('height', `${rowHeight}px`)
            .css('overflow', 'hidden').css('background-color', 'white');
    }

    /**
     * Resizes all of the Plotly plots with the class 'className'
     * @param {String} className selects which plots to resize
     * @param {Number} plotHeight the height to set the plots to
     */
    function resizePlots(className, plotHeight) {
        const plotsToResize = Plotly.d3.selectAll(className).filter('.js-plotly-plot')
            .style('width', '100%').style('height', `${plotHeight}px`)[0]
            .forEach(node => Plotly.Plots.resize(node));
    }

    /**
     * Creates the server overview table
     * @param {Object} overviewData the data needed to make the overview table
     */
    function serverOverview(overviewData) {
        const tableBody = d3.select('#metadata')
            .attr('class', 'half-height panel panel-default')
            .style('background-color', 'white')
            .style('overflow-x', 'scroll')
            .style('marginBottom', `${verticalMarginHeight}px !important`) // panel marginBottom overrides this
            .style('height', `${(rowHeight - verticalMarginHeight) / 2}px`)
            .append('table')
            .attr('class', 'table table-hover table-condensed')
            .style('height', '100%')
            .append('tbody');

        function addTableRow(tableBody, infoArr) {
            const tableRow = tableBody.append('tr');
            infoArr.forEach((info) => {
                tableRow.append('td').html(info);
            });
        }

        const getGlyph = (bool) => `<span class="glyphicon glyphicon-${bool ? 'ok' : 'remove'}" aria-hidden="true"></span>`;
        addTableRow(tableBody, ['Server URL', `<a target="_blank" href="${overviewData.url}">${overviewData.url}</a>`]);
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
        const layoutCopy = JSON.parse(JSON.stringify(layout));
        layoutCopy.font = { family: 'sans-serif', };
        layoutCopy.title = title;
        return layoutCopy;
    }

    /**
     * Returns an animation for the screen to vertically scroll to a given point
     * @param {Number} yPoint the y-coordinate of the point to scroll to
     */
    const animateScroll = (yPoint) => $('html, body').animate({ scrollTop: yPoint, }, 'slow');

    /**
     * Truncates a string to a given length if the string is longer than the given length
     * @param {String} str the string to truncate
     * @param {Number} maxLen the maximum length of the string to return
     * @returns {String} the truncated string (with string.length <= maxLen)
     */
    function truncateString(str, maxLen) {
        const trimStr = str.trim();
        return (trimStr.length > maxLen) ? `${trimStr.substr(0, maxLen - 3).trim()}...` : trimStr;
    }

    /**
     * Truncates the labels in the condition matrix, the medication bar chart, and the box plots
     */
    function truncateLabels() {
        $('#matrix, #meds, #boxes').find('.xtick > text, .ytick > text')
            .text((index, str) => `${truncateString(str, 15)} `);
    }

    /**
     * Connects a button on the sidebar to an element on the page to scroll to
     * @param {String} sideButton the selector for the button on the sidebar
     * @param {String} element the selector for the element to scroll to
     */
    function linkSidebarButton(sideButton, element) {
        $(sideButton).click(() => animateScroll($(element).offset().top - headerHeight));
    }

    /**
     * Parses a URL and returns the value of a given parameter
     * @param {String} variable the parameter that you want the value of
     * @returns {String|Boolean} the value of the given parameter or false if it doesn't exist
     */
    function getQueryVariable(variable) {
        const vars = window.location.search.substring(1).split('&');
        for (let i = 0; i < vars.length; i++) {
            const pair = vars[i].split('=');
            if (decodeURIComponent(pair[0]) == variable) return decodeURIComponent(pair[1]);
        }
        return false;
    }

    // Run ==================================================================================

    $(start);

})(jQuery);