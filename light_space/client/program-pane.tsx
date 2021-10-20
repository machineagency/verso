interface Props {};
interface ProgramLineProps {
    lineNumber: number;
    lineText: string;
};

interface State {};
interface ProgramPaneState {
    showLivelitWindow: boolean;
    livelitLineNumber: number;
};
interface ProgramLineState {
    lineText: string;
};

class ProgramPane extends React.Component<Props, ProgramPaneState> {
    defaultLines = [
        'let signature = $geometryGallery;',
        'let point = $pointPicker;',
        'let toolpath = signature.placeAt(point);',
        '// $toolpathTransformer signature',
        '// $machineSynthesizer gigapan coinGeometry',
        'machine.plot(toolpath);'
    ];

    constructor(props: Props) {
        super(props);
        this.state = {
            showLivelitWindow: true,
            livelitLineNumber: 1
        };
    }

    parseTextForLivelit(text: string) : JSX.Element {
        const re = /\$\w+/;
        const maybeMatch = text.match(re);
        const defaultEl = <div></div>;
        if (!maybeMatch) {
            return <div></div>
        }
        const livelitName = maybeMatch[0].slice(1);
        switch (livelitName) {
            case 'geometryGallery':
                return <GeometryGallery></GeometryGallery>
            case 'pointPicker':
                return <PointPicker></PointPicker>
            default:
                return defaultEl;
        }
    }

    renderTextLines(textLines: string[]) {
        const lines = textLines.map((line, index) => {
            const lineNumber = index + 1;
            // TODO: for now naively expand all livelits, next step is
            // to add on click functionality
            if (true) {
            // if (lineNumber === this.state.livelitLineNumber) {
                const livelitWindow = this.parseTextForLivelit(line);
                return [
                    <ProgramLine lineNumber={lineNumber}
                                 key={index}
                                 lineText={line}></ProgramLine>,
                    livelitWindow
                ]
            }
            return <ProgramLine lineNumber={lineNumber}
                                key={index}
                                lineText={line}></ProgramLine>
        }).flat();
        return lines;
    }

    render() {
        return [
            <div className="program-lines">
                { this.renderTextLines(this.defaultLines) }
            </div>,
            <div className="program-controls">
                <div className="pc-btn pc-step">Run</div>
                <div className="pc-btn pc-reset">Reset</div>
            </div>
        ];
    }
}

class ProgramLine extends React.Component<ProgramLineProps, ProgramLineState> {
    constructor(props: ProgramLineProps) {
        super(props);
        this.state = {
            lineText: props.lineText
        };
    }

    render() {
        const lineNumber = this.props.lineNumber || 0;
        return <div className="program-line"
                    id={`line-${lineNumber - 1}`}>
                    {this.state.lineText}
               </div>
    }
}

class LivelitWindow extends React.Component<Props, State> {
    titleText: string;
    livelitClassName: string;
    titleKey: number;
    contentKey: number;

    constructor(props: Props) {
        super(props);
        this.titleText = 'Livelit Window';
        this.livelitClassName = 'livelit-window';
        this.titleKey = 0;
        this.contentKey = 1;
    }

    renderTitle() {
        return <div className="title"
                    key={this.titleKey.toString()}>
                    {this.titleText}
               </div>;
    }

    renderContent() {
        return <div className="content"
                    key={this.contentKey.toString()}>
               </div>;
    }

    render() {
        return <div className={this.livelitClassName}>
                    {[ this.renderTitle(), this.renderContent() ]}
               </div>
    }
};

class GeometryGallery extends LivelitWindow {
    constructor(props: Props) {
        super(props);
        this.titleText = 'Geometry Browser';
    }

    renderGalleryItem(itemNumber: number) {
        return <div className="gallery-item"
                    key={itemNumber.toString()}>
               </div>;
    }

    renderContent() {
        const numGalleryItems = 6;
        const galleryItems = [...Array(numGalleryItems).keys()].map(n => {
            return this.renderGalleryItem(n);
        });
        return <div className="content"
                    key={this.contentKey.toString()}>
                    <div className="geometry-browser">
                        { galleryItems }
                    </div>
               </div>
    }
}

class PointPicker extends LivelitWindow {
    constructor(props: Props) {
        super(props);
    }

    renderContent() {
        return <div className="point-picker">
                   <div className="table-thumbnail">
                       <div className="crosshair"></div>
                   </div>
                   <div className="point-text">
                       (154, 132)
                   </div>
                   <div className="help-text">
                       Click a point in the work envelope to update this value.
                   </div>
               </div>;
    }
}

const inflateProgramPane = () => {
    const blankDom = document.querySelector('#program-container');
    const programPane = <ProgramPane></ProgramPane>;
    ReactDOM.render(programPane, blankDom);
};

export { inflateProgramPane };