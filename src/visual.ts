/*
 *  Power BI Population Pyramid Visualization
 *
 *  Copyright (c) Tanzo Creative
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ''Software''), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

module powerbi.extensibility.visual {
    'use strict';

    //#region data models
    import IVisual = powerbi.extensibility.visual.IVisual;
    import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
    import IInteractivityService = powerbi.extensibility.utils.interactivity.IInteractivityService;
    import createInteractivityService = powerbi.extensibility.utils.interactivity.createInteractivityService;
    import appendClearCatcher = powerbi.extensibility.utils.interactivity.appendClearCatcher;
    import ISelectableDataPoint = powerbi.extensibility.utils.interactivity.SelectableDataPoint;
    import ISelectionID = powerbi.extensibility.ISelectionId;
    import IVisualSelectionId = powerbi.visuals.ISelectionId;
    import ISemanticFilter = powerbi.data.ISemanticFilter;
    import svgUtils = powerbi.extensibility.utils.svg;

    class ChartViewModel {
        public dataPoints: DataPoint[] = [];
        public isHighlighted: boolean = false;
        private savedSelection: { [key: string]: boolean } = {};

        public saveSelection(): void {
            for (const dataPoint of this.dataPoints) {
                this.savedSelection[dataPoint.selectionId.getKey()] = dataPoint.selected;
            }
        }

        public restoreSelection(): void {
            for (const dataPoint of this.dataPoints) {
                dataPoint.selected = this.savedSelection[dataPoint.selectionId.getKey()] || false;
            }
        }

        public getKeys(): string[] {
            return this.dataPoints.map(function (d: DataPoint): string { return d.selectionId.getKey(); });
        }
    }

    export interface IDataPoint extends ISelectableDataPoint {
        dayOfWeek: string;
        hourOfDay: string;
        value: number;
        highlightValue: number;
        highlighted: boolean;
        // Inherited from ISelectableDataPoint (Remember to check as may change)
        // selected: boolean;
        // identity: ISelectionId | ExtensibilityISelectionId;
        // specificIdentity?: ISelectionId | ExtensibilityISelectionId;
    }

    export class DataPoint implements IDataPoint {
        public dayOfWeek: string;
        public hourOfDay: string;
        public value: number;
        public highlightValue: number;

        public identity: ISelectionId;
        public specificIdentity?: ISelectionId;
        public highlighted: boolean;
        public selected: boolean;

        constructor(params: IDataPoint) {
            this.dayOfWeek = params.dayOfWeek;
            this.hourOfDay = params.hourOfDay;
            this.value = params.value;
            this.highlightValue = params.highlightValue;
            this.identity = params.identity;
            this.specificIdentity = params.specificIdentity;
            this.highlighted = params.highlighted;
            this.selected = params.selected;
        }
        // Use a property to expose the methods on ISelectionId defined in powerbi.visuals.
        get selectionId(): IVisualSelectionId {
            return this.identity as IVisualSelectionId;
        }

        public static convert(el: SVGElement): IDataPoint {
            if (el) {
                return {
                    dayOfWeek: el['dayOfWeek'],
                    hourOfDay: el['hourOfDay'],
                    value: el['values'],
                    highlightValue: el['highlightValue'],
                    identity: el['identity'],
                    specificIdentity: el['specificIdentity'],
                    highlighted: el['highlighted'],
                    selected: el['selected']
                };
            } else {
                return null;
            }
        }

        public static dayOfWeekIndex(day: string): number {
            let dayIndex: number = 10;
            switch (day.toLowerCase()) {
                case 'monday':
                case 'mon':
                case 'mo':
                case '0':
                    dayIndex = 0;
                    break;
                case 'tuesday':
                case 'tue':
                case 'tu':
                case '1':
                    dayIndex = 1;
                    break;
                case 'wednesday':
                case 'wed':
                case 'we':
                case '2':
                    dayIndex = 2;
                    break;
                case 'thursday':
                case 'thu':
                case 'th':
                case '3':
                    dayIndex = 3;
                    break;
                case 'friday':
                case 'fri':
                case 'fr':
                case '4':
                    dayIndex = 4;
                    break;
                case 'saturday':
                case 'sat':
                case 'sa':
                case '5':
                    dayIndex = 5;
                    break;
                case 'sunday':
                case 'sun':
                case 'su':
                case '6':
                    dayIndex = 6;
                    break;
                case 'bank holiday':
                case 'holiday':
                case 'hol':
                case 'bh':
                case '7':
                    dayIndex = 7;
                    break;
                default:
                    dayIndex = 10;
                    break;
            }
            return dayIndex;
        }
    }

    /**
     * Interface to define clickable-axis labels
     * This data is bound to the label and passed to the event handler
     * @export
     * @interface ILabelData
     */
    export interface ILabelData {
        name: string;
        text: string;
        filter: number;
        location: string;
        anchor: string;
    }
    //#endregion

    export class Visual implements IVisual {
        private host: IVisualHost;
        private target: HTMLElement;
        private svg: d3.Selection<SVGElement>;
        private chart: d3.Selection<SVGElement>;
        private settings: VisualSettings = new VisualSettings();
        private viewModel: ChartViewModel = new ChartViewModel();
        private selectionTools: VisualSelectionTools;
        private colorTools: ColorTools = new ColorTools();
        private locale: string;
        private wasHighlighted: boolean;
        private wasSelected: boolean;

        constructor(options: VisualConstructorOptions) {
            this.target = options.element;
            this.host = options.host;
            this.locale = options.host.locale;

            this.svg = d3.select(this.target).append('svg');

            // Create selection tools to manage data selections in the visual
            this.selectionTools = new VisualSelectionTools(this.host);
            this.selectionTools.interactivityService = createInteractivityService(options.host);
            this.selectionTools.clearCatcher = appendClearCatcher(this.svg) as d3.Selection<SVGElement>;
            this.selectionTools.allowInteractions = this.host.allowInteractions;
            this.selectionTools.settings = this.settings.dataPoint;
        }

        public update(options: VisualUpdateOptions): void {

            // Refresh settings from the interface
            this.settings = this.parseSettings(options && options.dataViews && options.dataViews[0]);

            // Refresh data from the interface/tables
            this.refreshData(this.viewModel, options);
            this.updateState();

            //
            // Draw the visual
            //
            this.heatmap(options.viewport.width, options.viewport.height, this.viewModel.dataPoints);

            if (this.selectionTools.allowInteractions) {
                // Select all clickable data points (class are added when drawing the visual and then used to select event targets)
                const selectionToolsParams: ISelectionToolsParams = {
                    visualDataPoints: this.chart.selectAll('.dataPoint'),
                    categories: this.chart.selectAll('.dayLabel'),
                    axisLabel: this.chart.selectAll('.timeLabel')
                };

                // Bind event handlers to the event targets.
                this.selectionTools.interactivityService.bind(this.viewModel.dataPoints, this.selectionTools, selectionToolsParams);
            }
        }

        public updateState(): void {
            // Check status of highlights and selections to drive the state model
            const isHighlighted: boolean = this.viewModel.isHighlighted;
            const isSelected: boolean = this.selectionTools.interactivityService.hasSelection();

            // Need to clear selection & filters when we click on another object which filters the selection.
            if (this.wasSelected && isHighlighted) {
                this.selectionTools.clearSelection();
            }

            this.wasHighlighted = isHighlighted;
            this.wasSelected = isSelected;
        }

        /**
         * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
         * objects and properties you want to expose to the users in the property pane.
         *
         */
        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {

            const objectName: string = options.objectName;
            const objectEnumeration: VisualObjectInstance[] = [];
            const settings: DataPointSettings = this.settings.dataPoint;

            // For each control object provie a link between the uer interface and the settings property
            switch (objectName) {
                case 'formatting':
                    const formatProperties: {
                        bankHoliday: boolean,
                        fontSize: number,
                        unitsLabel: string,
                        tileShape: string,
                        colorScheme: string,
                        background: boolean;
                        backgroundColor?: { solid: { color: string } };
                        percentile?: number;
                        lowestColor?: { solid: { color: string } }, // Optional elements that will be displayed depending on colorScheme
                        midColor?: { solid: { color: string } },
                        highestColor?: { solid: { color: string } }
                    } = {
                            bankHoliday: settings.bankHoliday,
                            fontSize: settings.axisFontSize,
                            unitsLabel: settings.unitsLabel,
                            tileShape: settings.tileShape,
                            colorScheme: settings.colorScheme,
                            background: settings.background
                        };
                    if (settings.background) {
                        formatProperties['backgroundColor'] = { solid: { color: settings.backgroundColor } };
                        formatProperties['percentile'] = settings.backgroundOpacity;
                    }
                    switch (settings.colorScheme) {
                        case 'Custom2':
                            formatProperties['lowestColor'] = { solid: { color: settings.lowestColor } };
                            formatProperties['highestColor'] = { solid: { color: settings.highestColor } };
                            break;
                        case 'Custom3':
                            formatProperties['lowestColor'] = { solid: { color: settings.lowestColor } };
                            formatProperties['midColor'] = { solid: { color: settings.midColor } };
                            formatProperties['highestColor'] = { solid: { color: settings.highestColor } };
                            break;
                        default:
                    }
                    objectEnumeration.push({
                        objectName: objectName,
                        properties: formatProperties,
                        selector: null
                    });
                default:
            }
            return objectEnumeration;
        }

        /**
         *
         * The following functions extend the user interface in conjunction with settings.ts and capabilities.json
         *
         * For each control added on the interface:
         *  + Define the control in the capabilities.json file - this signals to the interface what is to be displayed
         *  + Added a property to the settings.ts (dataPointSettings class) to store the user interface state
         *  + Add an object to in enumerateObjectInstance to link the user interface to the settings variable
         *  + Add an assignment to parse the setting from the returned DataView object.
         *
         */
        private parseSettings(dataView: DataView): VisualSettings {

            const visualSettings: VisualSettings = <VisualSettings>VisualSettings.parse(dataView);

            const root: DataViewObjects = dataView.metadata.objects;
            const setting: DataPointSettings = visualSettings.dataPoint;

            if (root != null) {

                if ('formatting' in root) {
                    const formatting: DataViewObject = root['formatting'];

                    setting.bankHoliday = ('bankHoliday' in formatting) ? <boolean>formatting['bankHoliday'] : setting.bankHoliday;
                    setting.axisFontSize = ('fontSize' in formatting) ? <number>formatting['fontSize'] : setting.axisFontSize;
                    setting.tileShape = ('tileShape' in formatting) ? <string>formatting['tileShape'] : setting.tileShape;
                    setting.colorScheme = ('colorScheme' in formatting) ? <string>formatting['colorScheme'] : setting.colorScheme;
                    setting.lowestColor = ('lowestColour' in formatting) ? <string>formatting['lowestColour']['solid']['color'] : setting.lowestColor;
                    setting.midColor = ('midColour' in formatting) ? <string>formatting['midColour']['solid']['color'] : setting.midColor;
                    setting.highestColor = ('highestColour' in formatting) ? <string>formatting['highestColour']['solid']['color'] : setting.highestColor;
                    setting.unitsLabel = ('unitsLabel' in formatting) ? <string>formatting['unitsLabel'] : setting.unitsLabel;
                    setting.background = ('background' in formatting) ? <boolean>formatting['background'] : setting.background;
                    setting.backgroundColor = ('backgroundColor' in formatting) ? <string>formatting['backgroundColor']['solid']['color'] : setting.backgroundColor;
                    setting.backgroundOpacity = ('percentile' in formatting) ? <number>formatting['percentile'] : setting.backgroundOpacity;
                }
            }
            return visualSettings;
        }

        /**
         * Method called by update to load data from Power BI into the visual
         *
         * @private
         * @param {ChartViewModel} chartViewModel Pointer to data used in the model
         * @param {VisualUpdateOptions} data Pointer to data from the host
         * @memberof Visual
         */
        private refreshData(chartViewModel: ChartViewModel, data: VisualUpdateOptions): void {

            // Reset list of DataPoints, whilst retaining saved selectoin
            chartViewModel.saveSelection();

            chartViewModel.dataPoints = [];

            // Initialise the list of fields in the interface - enum must match field names in capabilities.json
            enum interfaceFields { 'values' }

            const fieldIndices: { [key: number]: number } = {};
            const dataView: DataView = data.dataViews[0];

            // Identify which field names are present and map the data column index to them.
            // Note the mapping of measures to values will vary depending upon how the user has populated interface fields
            // It CANNOT be assumed that a measure will be at the same index position with each update.
            const node: DataViewValueColumns = data.dataViews[0].categorical.values;
            for (let i: number = 0; i < node.length; i++) {
                for (const field in interfaceFields) {
                    if (field in node[i].source.roles) {
                        fieldIndices[interfaceFields[field]] = i;
                    }
                }
            }

            // Category columns are more easily mapped as the visual will not update until they are both populated.
            const dayOfWeek: DataViewCategoryColumn = dataView.categorical.categories[0];
            const hourOfDay: DataViewCategoryColumn = dataView.categorical.categories[1];
            const valueColumn: DataViewValueColumn = node[fieldIndices[interfaceFields.values]];

            // Create function to read data values, and highlights, from columns into view model.
            const getValues: (name: number, i: number) => number = function (name: number, i: number): number {
                return (fieldIndices[name] != null && ('values' in node[fieldIndices[name]])) ?
                    <number>node[fieldIndices[name]].values[i] : null;
            };

            const getHighlights: (name: number, i: number) => number = function (name: number, i: number): number {
                return (fieldIndices[name] != null && ('highlights' in node[fieldIndices[name]])) ?
                    <number>node[fieldIndices[name]].highlights[i] : null;
            };

            chartViewModel.isHighlighted = false;

            // For each record load the data...
            for (let i: number = 0; i < dataView.categorical.categories[0].values.length; i++) {

                // ..Create selectionID....
                // Note: We only need one category column, assuming that this is to identify the table and determine Id for each row in the table.
                const selectionId: ISelectionId = this.host.createSelectionIdBuilder()
                    .withCategory(dayOfWeek, i)
                    .createSelectionId();

                // Identify if highlighted...
                const isHighlighted: boolean = (getHighlights(interfaceFields.values, i) == null ? false : true);

                // ...if at least one record is hilghlighted then set entire chart to highlighted
                if (isHighlighted) {
                    chartViewModel.isHighlighted = true;
                }

                // Create a new DataPoint in the chartView model
                chartViewModel.dataPoints.push(new DataPoint({
                    dayOfWeek: <string>dayOfWeek.values[i],
                    hourOfDay: <string>hourOfDay.values[i],
                    value: getValues(interfaceFields.values, i) || 0,
                    highlightValue: getHighlights(interfaceFields.values, i) || 0,
                    identity: selectionId,
                    specificIdentity: selectionId,
                    highlighted: isHighlighted,
                    selected: false
                }));
            }

            // Restore previously stored points selection...when a filter is applied it updates the visual
            // Therefore, if this visual is driving the selection we need to restore the selected points.
            if (this.selectionTools.interactivityService.hasSelection()) {
                chartViewModel.restoreSelection();
            }
        }

        /**
         *  The following functions define the chart to be shown in the view.
         *
         * Javascript View to create a population pyramid
         * Create the main body of the chart
         */

        private heatmap(windowWidth: number, windowHeight: number, data: DataPoint[]): void {

            const settings: DataPointSettings = this.settings.dataPoint;
            const bankHoliday: boolean = settings.bankHoliday;
            const chartFontSize: string = settings.axisFontSize.toString().concat('pt'); //'8pt';
            const lowestColour: string = settings.lowestColor;
            const midColour: string = settings.midColor;
            const highestColour: string = settings.highestColor;
            const unitsLabel: string = settings.unitsLabel;
            const colorScheme: string = settings.colorScheme;
            const tileShape: string = settings.tileShape;
            const allowInteractions: boolean = this.host.allowInteractions;
            const background: boolean = settings.background;
            const backgroundColor: string = settings.backgroundColor;
            const backgroundOpacity: number = settings.backgroundOpacity / 100;

            // RefTextSize is the size of a character on screen (used for adjusting chart for different type sizes)
            const refTextSize: { width: number, height: number } = this.textSize('W', chartFontSize);

            const fillet: number = 5;
            const margin: { top: number, right: number, bottom: number, left: number }
                = { top: refTextSize.height + 2 * fillet, left: refTextSize.width * 3 + fillet, bottom: fillet, right: fillet };

            const chartWidth: number = windowWidth - margin.left - margin.right;
            const chartHeight: number = windowHeight - margin.top - margin.bottom;

            const gridSize: number = Math.floor(chartWidth / 24);
            const gridBreak: number = Math.ceil(gridSize / 2);
            const legendElementWidth: number = gridSize * 2;
            const buckets: number = 9;

            const backgroundWidth: number = margin.left + margin.right + gridSize * 24;
            const backgroundHeight: number = margin.top + margin.bottom + (bankHoliday ? 8 : 7) * gridSize + (bankHoliday ? 2 : 1) * gridBreak;
            const legendHeight: number = gridSize / 2 + refTextSize.height * 2 + 2 * fillet;

            //
            // CREATE SVG
            //
            this.svg
                .attr('width', windowWidth)
                .attr('height', windowHeight)
                .style('fill-opacity', settings.transparent);

            if (this.chart != null && !this.chart.empty()) {
                this.svg.selectAll('#chart').remove();
            }

            this.chart = this.svg
                .append('g')
                .attr('id', 'chart')
                .attr('width', chartWidth)
                .attr('height', chartHeight)
                .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
                .style('fill-opacity', settings.solid);

            //
            // ADD A BACKGROUND TO AXIS AND TILES TO PROVIDE VISUAL COHERENCE
            //

            if (background) {
                this.chart.append('rect')
                    .attr('id', 'background')
                    .attr('width', backgroundWidth)
                    .attr('height', backgroundHeight)
                    .attr('transform', 'translate(-' + margin.left + ',-' + margin.top + ')')
                    .style('fill', backgroundColor)
                    .style('fill-opacity', backgroundOpacity);
            }

            //
            // CREATE AXIS LABELS
            //

            const yLegend: number = (bankHoliday ? 8 : 7) * gridSize + (bankHoliday ? 3 : 2) * gridBreak;
            const days: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            if (bankHoliday) {
                days.push('Hol');
            } else {
                data = data.filter(notBankHoliday);
            }

            const dayLabelData: ILabelData[] = [];
            for (const day of days) {
                dayLabelData.push(
                    {
                        name: 'dayLabel',
                        text: day,
                        filter: DataPoint.dayOfWeekIndex(day),
                        location: svgUtils.translate(0, 0),
                        anchor: 'end'
                    }
                );
            }

            const dayLabels: d3.Selection<ILabelData> = this.chart.selectAll('.dayLabel')
                .data(dayLabelData)
                .enter().append('text')
                .attr('class', 'dayLabel')
                .text(function (d: ILabelData): string { return d.text; })
                .style('font-size', chartFontSize)
                .attr('x', -5)
                .attr('y', function (d: ILabelData, i: number): number { return yOffset(i, gridSize, gridBreak); })
                .style('text-anchor', 'end')
                .attr('transform', 'translate(-6,' + gridSize / 1.5 + ')');

            const times: string[] = ['0', '1a', '2a', '3a', '4a', '5a', '6a', '7a', '8a', '9a', '10a', '11a', '12',
                '1p', '2p', '3p', '4p', '5p', '6p', '7p', '8p', '9p', '10p', '11p'];

            const timeLabelData: ILabelData[] = [];
            {
                let count: number = 0;
                for (const time of times) {
                    timeLabelData.push(
                        {
                            name: 'timeLabel',
                            text: time,
                            filter: count++,
                            location: svgUtils.translate(0, 0),
                            anchor: 'middle'
                        }
                    );
                }
            }

            const timeLabels: d3.Selection<ILabelData> = this.chart.selectAll('.timeLabel')
                .data(timeLabelData)
                .enter().append('text')
                .attr('class', 'timeLabel')
                .text(function (d: ILabelData): string { return d.text; })
                .style('font-size', chartFontSize)
                .attr('x', function (d: ILabelData, i: number): number { return i * gridSize; })
                .attr('y', -5)
                .style('text-anchor', 'middle')
                .attr('transform', 'translate(' + gridSize / 2 + ', -6)');

            //
            // DEFINE COLOR SCHEME
            //
            let colors: string[] = [];

            switch (colorScheme) {
                case 'Custom2':
                    colors = this.colorTools.interpolatedTwoColours(lowestColour, highestColour, buckets);
                    break;
                case 'Custom3':
                    colors = this.colorTools.interpolatedThreeColours(lowestColour, midColour, highestColour, buckets);
                    break;
                default:
                    colors = this.colorTools.colorScale(colorScheme, buckets);
                    break;
            }

            const colorScale: d3.scale.Quantile<string> = d3.scale.quantile<string>()
                .domain(distribution(data, buckets))
                .range(colors);

            //
            // ADD DATAPOINTS TO CHART
            //

            const tiles: d3.selection.Update<DataPoint> = this.chart.selectAll('.hour')
                .data(data, function (d: DataPoint): string { return DataPoint.dayOfWeekIndex(d.dayOfWeek) + ':' + d.hourOfDay; });

            tiles.append('title');

            const radius: number = gridSize * bevel(tileShape);

            tiles.enter().append('rect')
                .attr('class', 'dataPoint')
                .attr('x', function (d: DataPoint): number { return xOffset(Number(d.hourOfDay), gridSize); })
                .attr('y', function (d: DataPoint): number { return yOffset(DataPoint.dayOfWeekIndex(d.dayOfWeek), gridSize, gridBreak); })
                .attr('id', function (d: DataPoint): string { return d.dayOfWeek + ':' + d.hourOfDay; })
                .attr('rx', radius)
                .attr('ry', radius)
                .attr('width', gridSize)
                .attr('height', gridSize)
                .style('fill', function (d: DataPoint): string { return colorScale(d.value); });

            //
            // ADD A CHART LEGEND
            //
            // TODO: Option to move legend to top, left, right, bottom of chart.
            //
            if (background) {
                this.chart.append('rect')
                    .attr('id', 'legendBackground')
                    .attr('width', backgroundWidth)
                    .attr('height', legendHeight)
                    .attr('transform', 'translate(-' + margin.left + ',' + (yLegend - fillet) + ')')
                    .style('fill', backgroundColor)
                    .style('fill-opacity', backgroundOpacity);
            }

            const legend: d3.selection.Update<number> = this.chart.selectAll('.legend')
                .data([0].concat(colorScale.quantiles()), function (d: number): string { return d.toString(); });

            legend.append('g');

            legend.enter().append('rect')
                .attr('x', function (d: number, i: number): number { return legendElementWidth * i; })
                .attr('y', yLegend)
                .attr('width', legendElementWidth)
                .attr('height', gridSize / 2)
                .style('fill', function (d: number, i: number): string { return colors[i]; });

            legend.enter().append('text')
                .text(function (d: number): string { return '≥ ' + Math.round(d); })
                .style('font-size', chartFontSize)
                .attr('x', function (d: number, i: number): number { return legendElementWidth * i; })
                .attr('y', yLegend + gridSize / 2 + refTextSize.height);

            // add units
            this.chart.append('text')
                .attr('x', 0)
                .attr('y', yLegend + gridSize / 2 + refTextSize.height * 2)
                .attr('text-anchor', 'left')
                .style('text-decoration', 'bold')
                .text(unitsLabel)
                .style('font-size', chartFontSize);

            //
            // HELPER FUNCTIONS
            //

            //Calculate x location of tiles
            function xOffset(x: number, step: number): number {
                return x * step;
            }

            // Calculates y location for tile rows included a break before the weekend and one before the bank holiday
            function yOffset(y: number, step: number, space: number): number {
                return y * step + ((y > 4) ? space : 0) + ((y > 6) ? space : 0);
            }

            // Function to identify bank holidays in data so that they can be filtered out.
            function notBankHoliday(record: DataPoint): boolean {
                return (DataPoint.dayOfWeekIndex(record.dayOfWeek) === 7) ? false : true;
            }

            // TODO: Add fixed bounds to upper and lower scale values
            // Creates a distribution across n bands
            // TODO : Exponential, Logarithmic, Linear
            function distribution(distributionData: DataPoint[], bands: number): number[] {
                let disValues: number[] = [];

                disValues = [0, d3.max(distributionData, function (d: DataPoint): number { return d.value; })];

                return disValues;
            }

            function bevel(shape: string): number {
                let bevelScale: number = 0;
                switch (tileShape) {
                    case 'rounded1':
                        bevelScale = 0.1;
                        break;
                    case 'rounded2':
                        bevelScale = 0.25;
                        break;
                    case 'round':
                        bevelScale = 0.5;
                        break;
                    case 'square':
                    default:
                        bevelScale = 0;
                }
                return bevelScale;
            }

        }

        /*
         * Method to return the size of a text node (Written for SVG1.1, with SVG2 could use SVGGraphicsElement more elegantly)
         * TODO: Include Font/Type within the definition.
         *
         * @private
         * @param {string} text Text from which the screen width and height is required
         * @param {string} chartFontSize Font size of the text
         * @returns {{ width: number, height: number }} Width and Height of the bounding text box.
         * @memberof Visual
         */
        private textSize(text: string, chartFontSize: string): { width: number, height: number } {

            const docElement: HTMLDivElement = this.target.appendChild(document.createElement('div')) as HTMLDivElement;

            const svgDoc: SVGSVGElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            docElement.appendChild(svgDoc);

            const textElement: SVGTextElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            textElement.setAttributeNS(null, 'font-size', chartFontSize);
            textElement.textContent = text;

            svgDoc.appendChild(textElement);

            const size: { width: number, height: number } = textElement.getBBox();

            this.target.removeChild(docElement);

            return { width: size.width, height: size.height };
        }

    }
}
