/** This file contains React components for:
 *  - The program pane
 *  - All livelit windows and functionality as described in the Omar et al.
 *    paper.
 *  - Props of Livelit Components represent that livelit's parameter.
 *  - State of Livelit Components represent any GUI input elements within
 *    the livelit window whose splices will be used to write the expansion.
 *  - Class Properties thereof represent the model that will eventually be
 *    returned by the livelit. Note that we cannot rely on React state for this
 *    because we need synchonicity.
 */

/// <reference path="lib/perspective-transform.d.ts" />
import * as verso from './verso.js';
import { mm, px, ISA, GeometryFiletype } from './verso.js';
import { FormatUtil } from './format-util.js'
import { VisualizationInterpreters,
         InterpreterSignature } from './visualization-interpreters.js'
import { Cam } from './cam.js'
(window as any).mm = mm;
(window as any).px = px;

function RERUN() {
    document.getElementById('run-prog-btn')?.click();
}

interface Props {};
interface LivelitProps {
    /* Ref created in the parent that is a React "special" prop included here
     * such that the parent (e.g. ModulePane) has a reference to the component
     * to which this Ref has been passed as "ref." */
    ref: React.RefObject<LivelitWindow>;
    windowOpen: boolean;
    valueSet: boolean;
    key: string;

};
interface State {}
interface ProgramPaneProps {
    loadedWorkflowText: string;
};
interface ProgramPaneState {};
class ResetExecution extends Error {
    constructor() {
        let message = 'Resetting execution.';
        super(message);
    }
}

class ProgramUtil {
    static parseTextForLivelit(text: string,
                               livelitRef: React.RefObject<LivelitWindow>)
                               : JSX.Element | null {
        const re = /\$\w+/;
        const maybeMatch = text.match(re);
        const defaultEl = <div></div>;
        if (!maybeMatch) {
            return null;
        }
        const livelitName = maybeMatch[0].slice(1);
        switch (livelitName) {
            case 'geometryGallery':
                const ggProps: GeometryGalleryProps = {
                    ref: livelitRef as React.RefObject<GeometryGallery>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <GeometryGallery {...ggProps}>
                       </GeometryGallery>;
            case 'pointPicker':
                const ppProps: PointPickerProps = {
                    ref: livelitRef as React.RefObject<PointPicker>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <PointPicker {...ppProps}>
                       </PointPicker>;
            case 'tabletopCalibrator':
                const tcProps: TabletopCalibratorProps = {
                    machine: undefined,
                    tabletop: undefined,
                    ref: livelitRef as React.RefObject<TabletopCalibrator>,
                    valueSet: false,
                    windowOpen: false,
                    key: text
                };
                return <TabletopCalibrator {...tcProps}>
                       </TabletopCalibrator>;
            case 'cameraCalibrator':
                const ccProps: CameraCalibratorProps = {
                    ref: livelitRef as React.RefObject<CameraCalibrator>,
                    valueSet: false,
                    windowOpen: false,
                    key: text
                }
                return <CameraCalibrator {...ccProps}></CameraCalibrator>;
            case 'faceFinder':
                const ffProps: FaceFinderProps = {
                    camera: undefined,
                    ref: livelitRef as React.RefObject<FaceFinder>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <FaceFinder {...ffProps}>
                       </FaceFinder>;
            case 'axidrawDriver':
                const camProps: AxidrawDriverProps = {
                    ref: livelitRef as React.RefObject<AxidrawDriver>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <AxidrawDriver {...camProps}>
                       </AxidrawDriver>
            case 'toolpathVisualizer':
                const tdProps: ToolpathVisualizerProps = {
                    ref: livelitRef as React.RefObject<ToolpathVisualizer>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <ToolpathVisualizer {...tdProps}></ToolpathVisualizer>;
            case 'machineInitializer':
                const miProps: MachineInitializerProps = {
                    ref: livelitRef as React.RefObject<MachineInitializer>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <MachineInitializer {...miProps}></MachineInitializer>;
            case 'dispatcher':
                const dProps: DispatcherProps = {
                    ref: livelitRef as React.RefObject<Dispatcher>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <Dispatcher {...dProps}></Dispatcher>;
            case 'miniCam':
                const mcProps: MiniCamProps = {
                    ref: livelitRef as React.RefObject<MiniCam>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <MiniCam {...mcProps}></MiniCam>;
            case 'display':
                const displayProps: DisplayProps = {
                    ref: livelitRef as React.RefObject<Display>,
                    valueSet: false,
                    windowOpen: true,
                    key: text
                };
                return <Display {...displayProps}></Display>;
            default:
                return null;
        }
    }
}

type ConsoleFn = (msg: string) => void;
class ProgramPane extends React.Component<ProgramPaneProps, ProgramPaneState> {
    livelitRefs: React.RefObject<LivelitWindow>[];
    modulePaneRef: React.RefObject<ModulePane>;

    constructor(props: ProgramPaneProps) {
        super(props);
        this.livelitRefs = [];
        this.modulePaneRef = React.createRef<ModulePane>();
    }

    componentDidMount() {
        this.syntaxHighlightProgramLines();
    }

    syntaxHighlightProgramLines() {
        let programLinesDom = document.getElementById('program-lines');
        if (!programLinesDom) { return; }
        const pos = FormatUtil.caret(programLinesDom);
        FormatUtil.highlight(programLinesDom);
        FormatUtil.setCaret(pos, programLinesDom);
    }

    clearProgramConsole() {
        let programConsoleDom = document.getElementById('program-console');
        if (!programConsoleDom) {
            throw new Error('Cannot find program console while loading UI.');
        }
        programConsoleDom.innerText = '';
        programConsoleDom.classList.remove('error-state');
        programConsoleDom.classList.remove('warn-state');
    }

    bindNativeConsoleToProgramConsole() {
        // FIXME: this entire thing needs to use a monad style because otherwise
        // we will only show the LAST message per program run. Don't have time
        // for this now.
        let programConsoleDom = document.getElementById('program-console');
        if (!programConsoleDom) {
            throw new Error('Cannot find program console while loading UI.');
        }
        const consoleHandler = {
            apply: (target: ConsoleFn, thisArg: any, argList: any) => {
                if (!programConsoleDom) { return; }
                let msg = argList[0] as string;
                programConsoleDom.innerText = msg;
                programConsoleDom.classList.remove('error-state');
                programConsoleDom.classList.remove('warn-state');
                if (target.name === 'error') {
                    programConsoleDom.classList.add('error-state');
                }
                else if (target.name === 'warn') {
                    programConsoleDom.classList.add('warn-state');
                }
                programConsoleDom.innerText = msg;
                // Slight hack: if our messages was an error message, prepend
                // the true line number to the beginning of the console DOM
                // ONLY—not logging the number plus the error object because
                // then we lose stacktrace info in the native inspector.
                if (argList[0].lineNumber) {
                    let lineNumber = argList[0].lineNumber;
                    programConsoleDom.innerText = `Line ${lineNumber}: `
                        + programConsoleDom.innerText;
                }
                return target(msg);
            }
        };
        // FIXME: cannot unbind this uh oh
        console.log = new Proxy(console.log, consoleHandler);
        console.warn = new Proxy(console.warn, consoleHandler);
        console.error = new Proxy(console.error, consoleHandler);
    }

    injectText(text: string) {
        let programLinesDom = document.getElementById('program-lines');
        if (!programLinesDom) { return; }
        programLinesDom.innerHTML = '';
        this.livelitRefs = [];
        let textLines = text.split('\n').filter(line => line !== '');
        let plDom;
        textLines.forEach((line, index) => {
            if (programLinesDom) {
                const livelitRef = React.createRef<LivelitWindow>();
                this.livelitRefs.push(livelitRef);
                plDom = document.createElement('div');
                plDom.classList.add('program-line');
                plDom.innerText = line;
                programLinesDom.appendChild(plDom);
            }
        });
    }

    __getModules() : LivelitWindow[] {
        let modules : LivelitWindow[] = [];
        if (this.modulePaneRef.current) {
            let maybeNullMods = this.modulePaneRef.current.getModules();
            let nonNullMods = maybeNullMods.filter((mod) : mod is LivelitWindow => {
                return mod !== null;
            });
            return nonNullMods;
        }
        else {
            return [];
        }
    }

    getLivelitWithName(functionName: string) : State {
        let modules = this.__getModules();
        let moduleWindow = modules.find((mod) => {
            return mod.functionName === functionName;
        });
        return moduleWindow ? moduleWindow : {};
    }

    gatherLivelitsAsFunctionDeclarations() : string {
        interface functionStatePair {
            functionName: string;
            state: State;
        };
        let mods = this.__getModules();
        let expandedFunctionStrings : string[] = [];
        mods.forEach((mod) => {
            if (mod) {
                expandedFunctionStrings.push(mod.expand());
            }
        });
        let allExpandedFunctions = expandedFunctionStrings.join('\n');
        return allExpandedFunctions;
    }

    runAllLines() {
        const extractProgramText = () => {
            let progLinesDom = document.getElementById('program-lines');
            if (progLinesDom) {
                return progLinesDom.innerText;
            }
            return '';
        };
        const PROGRAM_PANE = this;
        let innerProgText = extractProgramText();
        let livelitFunctionDeclarations = this.gatherLivelitsAsFunctionDeclarations();
        let progText  = `${livelitFunctionDeclarations}`;
        progText += `\n(async function() {`;
        progText += `paper.project.clear();`;
        progText += `let maybeVizSpaceDom = document.getElementById('visualization-space');`;
        progText += `if (maybeVizSpaceDom) { maybeVizSpaceDom.innerHTML = ''; }`;
        progText += `try {`;
        progText += `${innerProgText}`;
        progText += `} catch (e) { console.error(e); }`;
        progText += `})();`;
        return new Promise<void>((resolve) => {
            eval(progText);
            resolve();
        });
    }


    generateModules() {
        return new Promise<void>((resolve, reject) => {
            let currentProgLinesDom = document.getElementById('program-lines');
            if (!currentProgLinesDom) { return; }
            let currentProgLines = currentProgLinesDom.innerText
                ? currentProgLinesDom.innerText
                : this.props.loadedWorkflowText;
            if (this.modulePaneRef.current) {
                this.modulePaneRef.current.setState((prevState: ModulePaneState) => {
                    return { text: currentProgLines }
                }, resolve);
            }
        });
    }

    render() {
        return (
            <div id="program-pane">
                <div id="program-lines-and-controls">
                    <div id="program-lines">
                    </div>
                    <div id="program-console"></div>
                    <div id="program-controls" className="hidden">
                        <div className={`pc-btn pc-compile`}
                             onClick={this.generateModules.bind(this)}>
                            Generate
                        </div>
                        <div id="run-prog-btn"
                             className={`pc-btn pc-run}`}
                             onClick={this.runAllLines.bind(this)}>
                             Run
                        </div>
                    </div>
                </div>
                <ModulePane ref={this.modulePaneRef}></ModulePane>
            </div>
        );
    }
}

interface ModulePaneProps extends Props {
}

interface ModulePaneState extends State {
    text: string;
}

class ModulePane extends React.Component<ModulePaneProps, ModulePaneState> {
    moduleRefs: React.RefObject<LivelitWindow>[];

    constructor(props: ModulePaneProps) {
        super(props);
        this.moduleRefs = [];
        this.state = {
            text: ''
        };
    }

    getModules() {
        let modules = this.moduleRefs.map(ref => {
            return ref ? ref.current : null;
        });
        let nonNullModules = modules.filter(maybeModule => maybeModule !== null);
        return nonNullModules;
    }

    mapLinesToLivelits() : JSX.Element[] {
        let lines = this.state.text.split(';').filter(line => line !== '');
        let livelits = lines.map((lineText, lineIndex) => {
            let moduleRef = React.createRef<LivelitWindow>();
            this.moduleRefs.push(moduleRef);
            return ProgramUtil.parseTextForLivelit(lineText, moduleRef);
        });
        let nonNullLiveLits = livelits.filter((ll): ll is JSX.Element => {
            return ll !== null;
        });
        return nonNullLiveLits;
    }

    render() {
        return (
            <div id="module-pane" key="module-pane">
                { this.mapLinesToLivelits() }
            </div>
        );
    }
}

interface LivelitState {
    windowOpen: boolean;
    valueSet: boolean;
}

class LivelitWindow extends React.Component {
    titleText: string;
    functionName: string;
    livelitClassName: string;
    titleKey: number;
    contentKey: number;
    applyButton?: JSX.Element;
    props: LivelitProps;
    state: LivelitState;

    constructor(props: LivelitProps) {
        super(props);
        this.props = props;
        this.titleText = 'Livelit Window';
        this.functionName = '$livelit';
        this.livelitClassName = 'livelit-window';
        this.titleKey = 0;
        this.contentKey = 1;
        this.state = {
            windowOpen: props.windowOpen,
            valueSet: props.valueSet,
        }
    }

    expand() : string {
        return 'function livelitExpansion() { };';
    }

    async openWindow() {
        return this._setWindowOpenState(true);
    }

    async closeWindow() {
        return this._setWindowOpenState(false);
    }

    toggleWindow() {
        if (this.state.windowOpen) {
            this.closeWindow();
        }
        else {
            this.openWindow()
        }
    }

    async _setWindowOpenState(open: boolean) {
        return new Promise<void>((resolve) => {
            this.setState((prev: LivelitState) => {
                return { windowOpen: open };
            }, resolve);
        });
    };

    saveValue() : any {
        return undefined;
    }

    clearSavedValue() : Promise<void> {
        return new Promise<void>((resolve) => {
            resolve();
        });
    }

    renderTitle() {
        return <div className="title"
                    key={this.titleKey.toString()}>
                    {this.titleText}
               </div>;
    }

    renderValue() {
        let maybeGrayed = this.state.valueSet ? '' : 'grayed';
        return (
            <div className={`module-value ${maybeGrayed}`}
                 key={`${this.titleKey}-value`}>
                 I am the value.
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
               </div>;
    }

    renderToggleButton() {
        return (
            <div className="toggle-window-btn"
                 onClick={this.toggleWindow.bind(this)}>
                { this.state.windowOpen ? 'close' : 'open' }
            </div>
        );
    }

    render() {
        return <div className={this.livelitClassName}
                    key={this.livelitClassName}>
                    <div className="title-and-toggle-bar">
                        { this.renderTitle() }
                        { this.renderToggleButton() }
                    </div>
                    { this.renderValue() }
                    { this.renderContent() }
               </div>
    }
};

interface GeometryGalleryProps extends LivelitProps {
    ref: React.RefObject<GeometryGallery>;
    windowOpen: boolean;
};

interface GeometryGalleryState extends LivelitState {
    selectedUrl: string;
    imageNameUrlPairs: [string, string][];
};

class GeometryGallery extends LivelitWindow {
    state: GeometryGalleryState;

    constructor(props: GeometryGalleryProps) {
        super(props);
        this.titleText = 'Geometry Gallery';
        this.functionName = '$geometryGallery';
        this.state = {
            selectedUrl: '',
            imageNameUrlPairs: [],
            windowOpen: props.windowOpen,
            valueSet: props.valueSet
        };
    }

    async init() {
        return new Promise<void>((resolve, reject) => {
            if (this.state.imageNameUrlPairs.length) {
                // NOTE: Disable this early return if we cannot assume that
                // image/3d model files on the server remain static.
                resolve();
            }
            this.fetchGeometryNames()
                .then((imageNameUrlPairs: [string, string][]) => {
                    let maybeSavedName = this.loadSavedValue();
                    let fallbackSavedName = 'box.svg';
                    let savedName = maybeSavedName || fallbackSavedName;
                    let selectedUrl = '';
                    let valueSet = false;
                    if (maybeSavedName) {
                        selectedUrl = this.getUrlForGeometryName(savedName,
                                        imageNameUrlPairs);
                        valueSet = true;
                    }
                    this.setState(_ => ({ selectedUrl, imageNameUrlPairs, valueSet }),
                        resolve);
                });
        });
    }

    expand() : string {
        let s = `async function ${this.functionName}(tabletop) {`;
        s += `let gg = PROGRAM_PANE.getLivelitWithName(\'${this.functionName}\');`;
        s += `await gg.init();`;
        s += `let geomUrl = gg.state.selectedUrl;`;
        s += `let geom = new verso.Geometry(tabletop);`;
        s += `let geomName = gg.getGeometryNameForUrl(geomUrl);`;
        s += `await geom.loadIntoPaperCanvas(geomName, geomUrl);`;
        s += `return geom;`;
        s += `}`;
        return s;
    }

    /**
     * Save the name of the geometry since URLs are volatile.
     */
    saveValue() {
        return new Promise<void>((resolve) => {
            if (this.state.selectedUrl) {
                let geomName = this.getGeometryNameForUrl(this.state.selectedUrl);
                localStorage.setItem(this.functionName, geomName);
                this.setState(_ => {
                    return {
                        valueSet: true
                    }
                }, resolve);
            }
            else {
                console.warn('GeometryGallery: Could not save geometry name.');
            }
        });
    }

    /**
     * Load a saved name if it exists, else undefined. The caller must convert
     * the name to a URL if needed.
     */
    loadSavedValue() {
        let geomName = localStorage.getItem(this.functionName);
        return geomName;
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    selectedUrl: '',
                    valueSet: false
                }
            }, resolve);
        });
    }

    setSelectedGeometryUrlAndRerun(url: string) {
        this.setState((state: GeometryGalleryState) => {
            return {
                selectedUrl: url
            };
        }, () => {
            this.saveValue();
            RERUN();
        });
    }

    renderGalleryItem(name: string, url: string, itemNumber: number) {
        const maybeHighlight = this.state.selectedUrl === url
                               ? 'gallery-highlight' : '';
        return <div className={`gallery-item ${maybeHighlight}`}
                    data-geometry-name={name}
                    onClick={this.setSelectedGeometryUrlAndRerun.bind(this, url)}
                    key={itemNumber.toString()}>
                    <img src={url}
                         className="gallery-image"/>
               </div>;
    }

    getUrlForGeometryName(desiredName: string, pairs?: [string, string][]) {
        let pairList = pairs || this.state.imageNameUrlPairs;
        let pairWithName = pairList.find((pair) => {
            let geomName = pair[0];
            let geomUrl = pair[1];
            return geomName === desiredName;
        });
        let currentUrl = pairWithName ? pairWithName[1] : '';
        return currentUrl;
    }

    getGeometryNameForUrl(url: string, pairs?: [string, string][]) {
        let pairList = pairs || this.state.imageNameUrlPairs;
        let pairWithSelectedUrl = pairList.find((pair) => {
            let geomName = pair[0];
            let geomUrl = pair[1];
            return geomUrl === this.state.selectedUrl;
        });
        let geomName = pairWithSelectedUrl ? pairWithSelectedUrl[0] : '';
        return geomName;
    }

    renderValue() {
        let maybeGrayed = this.state.valueSet ? '' : 'grayed';
        let geomName = this.getGeometryNameForUrl(this.state.selectedUrl);
        return (
            <div className={`module-value ${maybeGrayed}`}
                 key={`${this.titleKey}-value`}>
                 { geomName }
            </div>
        );
    }

    renderContent() {
        const galleryItems = this.state.imageNameUrlPairs.map((nameUrlPair, idx) => {
            let name = nameUrlPair[0];
            let url = nameUrlPair[1];
            return this.renderGalleryItem(name, url, idx);
        });
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
                    <div className="gallery">
                        { galleryItems }
                    </div>
               </div>
    }

    async fetchGeometryNames() : Promise<[string, string][]> {
        return new Promise<[string, string][]>(async (resolve) => {
            const namesUrl = '/geometries';
            let namesRes = await fetch(namesUrl);
            if (namesRes.ok) {
                let namesJson = await namesRes.json();
                let names : string[] = namesJson.names;
                let fetchImageUrl = async (name: string) => {
                    let imageRes = await fetch(`/geometry/${name}`);
                    if (imageRes.ok) {
                        let blob = await imageRes.blob();
                        let url = URL.createObjectURL(blob);
                        return url;
                    };
                    return '';
                };
                let urls: string[] = await Promise.all(names.map(fetchImageUrl));
                let nameUrlPairs: [string, string][] = names.map((name, idx) => {
                    let url: string = urls[idx] || '';
                    return [name, url];
                });
                resolve(nameUrlPairs);
            }
            else {
                resolve([]);
            }
        });
    }
}

interface PointPickerProps extends LivelitProps {
    ref: React.RefObject<PointPicker>;
    windowOpen: boolean;
};

class PointPicker extends LivelitWindow {
    props: PointPickerProps;

    constructor(props: LivelitProps) {
        super(props);
        this.props = props;
        this.titleText = 'Point Picker';
        this.functionName = '$pointPicker';
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`point-picker content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
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

interface TabletopCalibratorProps extends LivelitProps {
    machine: verso.Machine | undefined;
    tabletop: verso.Tabletop | undefined;
    ref: React.RefObject<TabletopCalibrator>;
    windowOpen: boolean;
};

interface TabletopCalibratorState extends LivelitState {
    tabletop?: verso.Tabletop;
    pixelToPhysical?: Homography;
};

class TabletopCalibrator extends LivelitWindow {
    state: TabletopCalibratorState;
    props: TabletopCalibratorProps;
    tabletop?: verso.Tabletop;
    applyButton: JSX.Element;

    constructor(props: TabletopCalibratorProps) {
        super(props);
        this.titleText = 'Tabletop Calibrator';
        this.functionName = '$tabletopCalibrator';
        this.tabletop = undefined;
        this.props = props;
        let maybeSavedHomography = this.loadSavedValue();
        this.state = {
            tabletop: undefined,
            windowOpen: props.windowOpen,
            pixelToPhysical: maybeSavedHomography,
            valueSet: !!maybeSavedHomography
        };
        this.applyButton = <div className="button apply-btn"
                                id="apply-tabletop-homography">
                                Apply
                            </div>
    }

    // FIXME: this doesn't properly apply saved homographies yet
    expand() : string {
        let s = `async function ${this.functionName}(machine) {`;
        s += `let tc = PROGRAM_PANE.getLivelitWithName(\'$tabletopCalibrator\');`;
        s += `tc.tabletop = new verso.Tabletop(machine);`;
        s += 'if (!tc.state.valueSet) {';
        s += 'await tc.openWindow();';
        s += `await tc.applyTabletopHomography();`;
        s += `await tc.saveValue();`;
        s += 'await tc.closeWindow();';
        s += '}';
        s += 'else {';
        s += 'tc.tabletop.homography = tc.state.pixelToPhysical;';
        s += '}';
        s += `machine.tabletop = tc.tabletop;`;
        s += `return tc.tabletop;`;
        s += `}`;
        return s;
    }

    drawBorder() {
        this.tabletop?.machine.drawBorder();
    }

    unlockCorners() {
        this.tabletop?.toggleWorkEnvelopeCalibration();
    }

    applyTabletopHomography() {
        return new Promise<void>((resolve) => {
            const applyButtonDom = document.getElementById('apply-tabletop-homography');
            if (applyButtonDom) {
                applyButtonDom.addEventListener('click', (event) => {
                    this.tabletop?.setHomographyFromCalibration();
                    resolve();
                });
            }
        });
    }

    saveValue() {
        return new Promise<void>((resolve) => {
            if (this.tabletop) {
                let h = this.tabletop.workEnvelope.homography;
                let hSerialized = JSON.stringify(h);
                localStorage.setItem(this.functionName, hSerialized);
                this.setState(_ => {
                    return {
                        pixelToPhysical: h,
                        valueSet: true
                    }
                }, resolve);
            }
            else {
                console.warn('TabletopCalibrator: Could not save homography.');
            }
        });
    }

    loadSavedValue() {
        interface RevivedHomography {
            srcPts: number[];
            dstPts: number[];
            coeffs: number[];
            coeffsInv: number[];
        }
        let coeffsStr = localStorage.getItem(this.functionName);
        if (coeffsStr) {
            let revivedH = JSON.parse(coeffsStr) as RevivedHomography;
            // Hopefully no numerical errors here.
            let h = PerspT(revivedH.srcPts, revivedH.dstPts);
            return h;
        }
        else {
            return undefined;
        }
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    pixelToPhysical: undefined,
                    valueSet: false
                }
            }, resolve);
        });
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let hiddenIffUnset = this.state.valueSet ? '' : 'hidden';
        let value = this.state.pixelToPhysical
                        ? this.state.pixelToPhysical.coeffs.toString()
                        : '?';
        let display = `Tabletop(WorkEnvelope(pixelToPhysical: `
                      + `[${value}]))`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
                 { display }
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`tabletop-calibrator content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
                   <div className="help-text">
                       1. Draw a border around the work envelope with the
                       machine.
                   </div>
                   <div onClick={this.drawBorder.bind(this)}
                        className="button" id="draw-border">
                       Draw Border
                   </div>
                   <div className="help-text">
                       2. Drag the corners of the projected border to match
                       the drawn border.
                   </div>
                   <div onClick={this.unlockCorners.bind(this)}
                        className="button" id="unlock-corners">
                       Unlock Corners
                   </div>
                   <div className="help-text">
                       3. Press 'Apply' when you are satisfied.
                   </div>
                   { this.applyButton }
               </div>;
    }
}

interface CameraCalibratorProps extends LivelitProps {
    ref: React.RefObject<CameraCalibrator>;
    windowOpen: boolean;
}

interface CameraCalibratorState extends LivelitState {
    unwarpedImageUrl: string;
    warpedImageUrl: string;
    /* Make this H optional rather than initializing it as an identity
     * because we are having a lot of problems producing an identity. */
    extrinsicTransform?: Homography;
    selectedPoints: verso.Point[];
};

class CameraCalibrator extends LivelitWindow {
    props: LivelitProps;
    state: CameraCalibratorState;
    tabletop?: verso.Tabletop;
    camera: verso.Camera;
    applyButtonId: string;
    applyButton: JSX.Element;
    photoButtonId: string;
    photoButton: JSX.Element;

    constructor(props: CameraCalibratorProps) {
        super(props);
        this.props = props;
        this.camera = new verso.Camera();
        this.titleText = 'Camera Calibrator';
        this.functionName = '$cameraCalibrator';
        this.applyButtonId = 'apply-camera-homography';
        this.applyButton = <div className="button apply-btn"
                                id={this.applyButtonId}>
                                Apply
                            </div>
        this.photoButtonId = 'cc-take-photo';
        this.photoButton = <div onClick={this.takePhoto.bind(this)}
                                className="button" id={this.photoButtonId}>
                               Take Photo
                           </div>
        let maybeSavedExtrinsicTransform = this.loadSavedValue();
        this.state = {
            unwarpedImageUrl: '',
            warpedImageUrl: '',
            extrinsicTransform: maybeSavedExtrinsicTransform,
            windowOpen: this.props.windowOpen,
            valueSet: !!maybeSavedExtrinsicTransform,
            selectedPoints: []
        };
    }

    setImageToTableScaling(camera: verso.Camera) {
        let feedDom = document.getElementById('cc-unwarped-feed') as HTMLImageElement;
        if (feedDom && this.tabletop) {
            if (feedDom.naturalWidth === 0 || feedDom.naturalHeight === 0) {
                console.warn('Camera Calibrator: window to table scaling '
                    + 'is incorrect because there is no image yet.');
            }
            camera.imageToTabletopScale.x = this.tabletop.workEnvelope.width
                / feedDom.naturalWidth
            camera.imageToTabletopScale.y = this.tabletop.workEnvelope.height
                / feedDom.naturalHeight
        }
        else {
            console.warn('Camera Calibrator: could not set window to table scaling.');
        }
    }

    async acceptCameraWarp() : Promise<verso.Camera> {
        return new Promise<verso.Camera>((resolve) => {
            const applyButton = document.getElementById(this.applyButtonId);
            if (applyButton) {
                applyButton.addEventListener('click', (event) => {
                    this.camera.extrinsicTransform = this.state.extrinsicTransform;
                    this.setImageToTableScaling(this.camera);
                    resolve(this.camera);
                });
            }
        });
    }

    saveValue() {
        return new Promise<void>((resolve, reject) => {
            if (this.camera.extrinsicTransform) {
                let h = this.camera.extrinsicTransform;
                let hSerialized = JSON.stringify(h);
                localStorage.setItem(this.functionName, hSerialized);
                this.setState(_ => {
                    return {
                        extrinsicTransform: h,
                        valueSet: true
                    }
                }, resolve);
            }
            else {
                console.warn('CameraCalibrator: Could not save homography.');
                resolve();
            }
        });
    }

    loadSavedValue() {
        interface RevivedHomography {
            srcPts: number[];
            dstPts: number[];
            coeffs: number[];
            coeffsInv: number[];
        }
        let coeffsStr = localStorage.getItem(this.functionName);
        if (coeffsStr) {
            let revivedH = JSON.parse(coeffsStr) as RevivedHomography;
            // Hopefully no numerical errors here.
            let h = PerspT(revivedH.srcPts, revivedH.dstPts);
            return h;
        }
        else {
            return undefined;
        }
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    extrinsicTransform: undefined,
                    valueSet: false
                }
            }, resolve);
        });
    }

    expand() : string {
        let s = `async function ${this.functionName}(tabletop) {`;
        s += `let cc = PROGRAM_PANE.getLivelitWithName(\'${this.functionName}\');`;
        s += `cc.tabletop = tabletop;`;
        s += `cc.camera.tabletop = cc.tabletop;`;
        s += `if (!cc.state.valueSet) {`;
        s += `await cc.openWindow();`;
        s += `await cc.takePhoto();`;
        s += `await cc.acceptCameraWarp();`;
        s += `await cc.saveValue();`;
        s += `await cc.closeWindow();`;
        s += `}`;
        s += `else {`;
        s += `let extrinsicTransform = cc.loadSavedValue();`;
        s += `cc.camera.extrinsicTransform = extrinsicTransform;`;
        s += `cc.setImageToTableScaling(cc.camera);`;
        s += `}`;
        s += `return cc.camera;`;
        s += `}`;
        return s;
    }

    drawBorder() {
        this.tabletop?.machine.drawBorder();
    }

    async takePhoto() {
        let imageUrl = await this.camera?.takePhoto();
        if (imageUrl) {
            this.setState((prev: CameraCalibratorState) => {
                return {
                    unwarpedImageUrl: imageUrl
                };
            })
        }
    }

    selectPoint(event: React.MouseEvent<HTMLImageElement>) {
        const target = event.target as HTMLImageElement;
        if (target) {
            const maybeInitiateWarp = async () => {
                if (this.state.selectedPoints.length === 4) {
                    // UL, UR, LR, LL
                    let cameraPointsUnrolled = [
                       [0, 0],
                       [target.naturalWidth, 0],
                       [target.naturalWidth, target.naturalHeight],
                       [0, target.naturalHeight]
                    ].flat();
                    let selectedPointsUnrolled = [
                        this.state.selectedPoints[0].flatten(),
                        this.state.selectedPoints[1].flatten(),
                        this.state.selectedPoints[2].flatten(),
                        this.state.selectedPoints[3].flatten()
                    ].flat();
                    let h = PerspT(cameraPointsUnrolled,
                                   selectedPointsUnrolled);
                    let url = `/camera/warpLastPhoto?coeffs=${h.coeffs}`
                    let res = await fetch(url);
                    if (res.ok) {
                        let blob = await res.blob();
                        let url = URL.createObjectURL(blob);
                        this.setState((prev: CameraCalibratorState) => {
                            return {
                                selectedPoints: [],
                                warpedImageUrl: url,
                                extrinsicTransform: h
                            };
                        });
                    }
                }
            };
            const cameraHeight = target.naturalHeight;
            const cameraWidth = target.naturalWidth;
            const scaledDownHeight = target.height;
            const scaledDownWidth = target.width;
            const domBoundingRect = target.getBoundingClientRect();
            const scaledX = event.clientX - domBoundingRect.left;
            const scaledY = event.clientY - domBoundingRect.top;
            const x = scaledX * (cameraWidth / scaledDownWidth);
            const y = scaledY * (cameraHeight / scaledDownHeight);
            const pt = new verso.Point(x, y);
            this.setState((prev: CameraCalibratorState) => {
                return {
                    selectedPoints: prev.selectedPoints.concat(pt)
                };
            }, maybeInitiateWarp)
        }
    }

    renderValue() {
        let maybeGrayed = this.state.valueSet ? '' : 'grayed';
        let value = this.state.extrinsicTransform
                    ? this.state.extrinsicTransform.coeffs.toString()
                    : '?';
        return (
            <div className={`module-value ${maybeGrayed}`}
                 key={`${this.titleKey}-value`}>
                 { `Camera(extrinsicTransform: [${value}])` }
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`camera-calibrator content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
                   <div className="help-text">
                       1. Draw a border around the work envelope with the
                       machine (skip if it's already there).
                   </div>
                   <div onClick={this.drawBorder.bind(this)}
                        className="button" id="draw-border">
                       Draw Border
                   </div>
                   <div className="help-text">
                       2. Make sure the camera is stationary, then click on the
                       four corners of the drawn border within the camera feed.
                       Click the points in the following order:
                   </div>
                   <div className="help-text">
                       <strong>upper left, upper right, lower right, lower left.</strong>
                   </div>
                   { this.photoButton }
                   <div className="image-thumbnail">
                       <img src={this.state.unwarpedImageUrl}
                            onClick={this.selectPoint.bind(this)}
                            id="cc-unwarped-feed"
                            alt="unwarped camera Feed"/>
                   </div>
                   <div className="help-text">
                       <strong>{ this.state.selectedPoints.length }</strong> points selected.
                   </div>
                   <div className="help-text">
                       3. Check the preview below and press 'Apply' when you
                       are satisfied.
                   </div>
                   <div className="image-thumbnail">
                       <img src={this.state.warpedImageUrl}
                            id="cc-warped-feed"
                            alt="warped camera Feed"/>
                   </div>
                   { this.applyButton }
               </div>;
    }
}

interface FaceFinderProps extends LivelitProps {
    camera?: verso.Camera;
    ref: React.RefObject<FaceFinder>;
    windowOpen: boolean;
}

interface FaceFinderState extends LivelitState {
    imageTaken: boolean;
    imagePath: string;
    detectedRegions: verso.Region[];
}

class FaceFinder extends LivelitWindow {
    state: FaceFinderState;
    camera?: verso.Camera;
    props: FaceFinderProps;
    photoButton: JSX.Element;
    acceptButton: JSX.Element;

    constructor(props: FaceFinderProps) {
        super(props);
        this.props = props;
        this.titleText = 'Face Finder';
        this.functionName = '$faceFinder';
        this.state = {
            imageTaken: false,
            imagePath: './img/seattle-times.jpg',
            detectedRegions: [],
            windowOpen: props.windowOpen,
            valueSet: props.valueSet
        }
        this.photoButton = <div onClick={this.takePhoto.bind(this)}
                                className="button" id="take-photo">
                               Take Photo
                           </div>
        this.acceptButton = <div className="button apply-btn" id="accept-faces">
                                Accept
                            </div>
    }

    async takePhoto() {
        let imageUrl = await this.camera?.takePhoto();
        if (imageUrl) {
            this.setState((prev: FaceFinderProps) => {
                return {
                    imageTaken: true,
                    imagePath: imageUrl
                };
            }, this.detectRegions);
        }
    }

    expand() : string {
        let s = `async function ${this.functionName}(camera) {`;
        s += `let ff = PROGRAM_PANE.getLivelitWithName(\'$faceFinder\');`;
        s += `ff.camera = camera;`;
        s += `await ff.openWindow();`;
        s += `let regions = await ff.acceptDetectedRegions();`;
        s += `await ff.closeWindow();`;
        s += `return regions;`;
        s += `}`;
        return s;
    }

    async detectRegions() {
        if (!this.camera) {
            return [];
        }
        let regions = await this.camera.findFaceRegions();
        return new Promise<void>((resolve) => {
            regions.forEach(r => {
                if (this.camera && this.camera.tabletop) {
                    r.drawOnTabletop(this.camera.tabletop);
                }
            });
            let prevRegions : verso.Region[];
            this.setState((prevState: FaceFinderState) => {
                prevRegions = prevState.detectedRegions;
                return {
                    detectedRegions: regions
                }
            }, () => prevRegions.forEach(r => {
                r.clearFromTabletop();
            }));
        });
    }

    async acceptDetectedRegions() {
        return new Promise<verso.Region[]>((resolve) => {
            let acceptDom = document.getElementById('accept-faces');
            if (acceptDom) {
                acceptDom.addEventListener('click', () => {
                    resolve(this.state.detectedRegions);
                });
            }
            else {
                console.warn('FaceFinder: accepting no faces.');
                resolve([]);
            }
        });
    }

    renderResults() {
        let resultLis : JSX.Element[] = this.state.detectedRegions
            .map((r, idx) => {
           return <li key={idx}>{r.toString()}</li>
        })
        return resultLis;
    }

    renderValue() {
        let maybeGrayed = this.state.valueSet ? '' : 'grayed';
        let value = this.state.detectedRegions.length > 0
                        ? `Region[]([${this.state.detectedRegions}])`
                        : '?';
        return (
            <div className={`module-value ${maybeGrayed}`}
                 key={`${this.titleKey}-value`}>
                 { value }
            </div>
        );
    }

    renderContent() {
        let image = this.state.imageTaken
                        ? <img src={this.state.imagePath}/>
                        : <div></div>;
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`face-finder content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
                   { this.photoButton }
                   <div className="image-thumbnail face-finder-thumbnail">
                       { image }
                   </div>
                   <div className="bold-text">
                       Faces Found
                   </div>
                   <ul className="face-list">
                        { this.renderResults() }
                   </ul>
                   { this.acceptButton }
               </div>;
    }
}

class ToolpathDirectManipulator extends LivelitWindow {
    constructor(props: LivelitProps) {
        super(props);
    }

    TODO_directManipulation() {
        console.warn('Not yet implemented.');

        /**
        // Check hit for each preview (box + mini toolpath)
        Object.values(this.toolpathCollection.thumbnailCollection)
        .forEach((thumbnail) => {
            let hitResult = thumbnail.hitTest(event.point, hitOptions);
            if (hitResult) {
                this.loadToolpathByName(thumbnail.versoName);
            }
        });
        // Able to manipulate toolpaths
        Object.values(this.toolpathCollection.collection)
        .forEach((toolpath) => {
            let hitResult = toolpath.hitTest(event.point, hitOptions);
            // if (hitResult) {
            if (toolpath.bounds.contains(event.point)) {
                toolpath.selected = true;
                this.activeToolpath = toolpath;
            }
            else {
                toolpath.selected = false;
            }
        });
        */
    }
}

interface AxidrawDriverProps extends LivelitProps {
    ref: React.RefObject<AxidrawDriver>;
    valueSet: boolean;
    windowOpen: boolean;
}

interface AxidrawDriverState extends LivelitState {
    currentDriverName?: DriverName;
    machine: verso.Machine;
    geometry?: verso.Geometry;
    toolpath?: verso.Toolpath;
}

type DriverName = 'Axidraw EBB'
    | 'Jasper\'s Wacky Slicer';
type CamIsaOutput = 'EBB' | 'g-Code';

interface SingleAxidrawDriver {
    name: DriverName;
    geometryInput: verso.GeometryFiletype;
    isaOutput: CamIsaOutput;
}

class AxidrawDriver extends LivelitWindow {
    state: AxidrawDriverState;
    drivers: SingleAxidrawDriver[];

    constructor(props: AxidrawDriverProps) {
        super(props);
        this.titleText = 'Axidraw Driver';
        this.functionName = '$axidrawDriver';
        this.drivers = [
            {
                name: 'Axidraw EBB',
                geometryInput: 'svg',
                isaOutput: 'EBB'
            }
        ];
        let maybeSavedAxidrawDriverName = this.loadSavedValue();
        let defaultDriverName: DriverName = 'Axidraw EBB';
        this.state = {
            currentDriverName: maybeSavedAxidrawDriverName || defaultDriverName,
            machine: new verso.Machine('TEMP'),
            geometry: undefined,
            toolpath: undefined,
            windowOpen: props.windowOpen,
            valueSet: !!maybeSavedAxidrawDriverName
        };
    }

    async setArguments(machine: verso.Machine, geometry: verso.Geometry) {
        return new Promise<void>((resolve) => {
            this.setState(_ => {
                return {
                    machine: machine,
                    geometry: geometry
                };
            }, () => {
                this.generateToolpathWithCurrentDriver()
                    .then((toolpath) => {
                        this.setState((prevState) => {
                            return { toolpath: toolpath }
                        }, resolve);
                     });
                });
            });
        }

    expand() : string {
        let s = `async function ${this.functionName}(machine, geometry) {`;
        s += `let cc = PROGRAM_PANE.getLivelitWithName(\'${this.functionName}\');`;
        s += `let toolpath;`;
        s += `await cc.setArguments(machine, geometry);`;
        s += `cc.generateToolpathWithCurrentDriver();`;
        s += `toolpath = cc.state.toolpath;`;
        s += `return toolpath;`;
        s += `}`;
        return s;
    }

    saveValue() {
        return new Promise<void>((resolve) => {
            if (this.state.currentDriverName) {
                localStorage.setItem(this.functionName, this.state.currentDriverName);
                this.setState(_ => {
                    return {
                        valueSet: true
                    }
                }, resolve);
            };
        });
    }

    loadSavedValue() : DriverName | undefined {
        let compilerName = localStorage.getItem(this.functionName);
        if (compilerName) {
            // TODO: actually verify
            return compilerName as DriverName;
        };
        return undefined;
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    currentDriverName: undefined,
                    valueSet: false
                }
            }, resolve);
        });
    }

    async generateToolpathWithCurrentDriver(): Promise<verso.Toolpath> {
        // TODO: find the correct compiler to use, for now assume Axidraw.
        // return early if we cannot find an appropriate compiler
        // for the current machine.
        return new Promise<verso.Toolpath>((resolve, reject) => {
            let compiler = this.drivers.find(c => c.name
                === this.state.currentDriverName);
            if (!this.state.geometry) {
                reject('Geometry not set');
            }
            else if (!compiler) {
                reject(`Can't find a compiler named`
                    + ` ${this.state.currentDriverName}`);
            }
            else if (compiler.geometryInput !== this.state.geometry.filetype) {
                reject(`${this.state.currentDriverName} cannot compile`
                    + ` a geometry with filetype ${this.state.geometry.filetype}`);
            }
            else {
                this.state.machine
                    .compileGeometryToToolpath(this.state.geometry)
                    .then((toolpath) => resolve(toolpath));
            }
        });
    }

    async acceptToolpath() : Promise<verso.Toolpath>{
        return new Promise<verso.Toolpath>((resolve, reject) => {
            const doneDom = document.getElementById('done-cam-compiler');
            if (doneDom) {
                doneDom.addEventListener('click', (event) => {
                    if (this.state.toolpath) {
                        resolve(this.state.toolpath);
                    }
                });
            }
        });
    }

    setCurrentDriver(event: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        let compilerItemDom = event.target as HTMLDivElement;
        let compilerName = compilerItemDom.dataset.compilerName;
        if (compilerName) {
            this.setState((prevState) => {
                return { currentDriverName: compilerName };
            }, () => {
                this.generateToolpathWithCurrentDriver()
                    .then((toolpath) => {
                        this.setState((prevState) => {
                            return {
                                toolpath: toolpath
                            };
                        }, () => {
                            this.saveValue();
                            RERUN();
                        });
                });
            });
        }
    }

    renderDrivers() {
        let compilerDoms = this.drivers.map((compiler: SingleAxidrawDriver,
                                               idx: number) => {
            let maybeGrayed = compiler.geometryInput !== this.state.geometry?.filetype
                                ? 'grayed' : '';
            let maybeHighlight = compiler.name === this.state.currentDriverName
                                 && !maybeGrayed
                                ? 'highlight' : '';
            return (
                <div className={`cam-compiler-item ${maybeHighlight} ${maybeGrayed}`}
                     key={idx}
                     data-compiler-name={compiler.name}
                     onClick={this.setCurrentDriver.bind(this)}>
                    <span className="compiler-name param-key"
                          data-compiler-name={compiler.name}>
                         { compiler.name }
                    </span>
                    <span className="geometry-input param-value"
                          data-compiler-name={compiler.name}>
                         { compiler.geometryInput }
                    </span>
                    <span className="isa-output param-value"
                          data-compiler-name={compiler.name}>
                         { compiler.isaOutput }
                    </span>
                </div>
            );
        });
        return (
            <div id="cam-compiler-list" className="boxed-list">
                { compilerDoms }
            </div>
        );
    }

    renderToolpathInstructions() {
        let instElements : JSX.Element[] = [];
        if (this.state.toolpath) {
            instElements = this.state.toolpath.instructions
                .map((inst, idx) => {
                return (
                    <div className={`inst-list-item`}
                         key={idx}>{inst}</div>
                );
            });
        }
        return (
            <div id="inst-list" className="boxed-list">{ instElements }</div>
        );
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let hiddenIffUnset = this.state.valueSet ? '' : 'hidden';
        let display = `${this.state.currentDriverName}`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
                 { display }
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return (
            <div className={`cam-compiler content ${maybeHidden}`}>
                { this.renderToolpathInstructions() }
            </div>
        );
    }
}

interface ToolpathVisualizerProps extends LivelitProps {
    ref: React.RefObject<ToolpathVisualizer>;
    valueSet: boolean;
    windowOpen: boolean;
}

interface ToolpathVisualizerState extends LivelitState {
    machine: verso.Machine;
    toolpath: verso.Toolpath;
    visualizationSpace?: verso.VisualizationSpace;
    currentInterpreterId: number;
    selectedInstIndex: number;
}

interface VisualizerInterpreter {
    name: string;
    description: string;
    isa: ISA;
    implementation: InterpreterSignature;
    id: number;
}

class ToolpathVisualizer extends LivelitWindow {
    state: ToolpathVisualizerState;
    interpreters: VisualizerInterpreter[];

    constructor(props: ToolpathVisualizerProps) {
        super(props);
        this.titleText = 'Toolpath Visualizer';
        this.functionName = '$toolpathVisualizer';
        // TODO: move the interpreter methods somewhere else where we can declare
        // a type and also generate this.interpreters programatically.
        this.interpreters = [
            {
                name: 'Basic Lines (G-code)',
                description: 'All movement lines.',
                isa: 'ebb',
                implementation: VisualizationInterpreters.ebbBasicViz,
                id: 0
            },
            {
                name: 'Colored Travel vs Draw (EBB)',
                description: 'Travel and plot lines encoded by color.',
                isa: 'ebb',
                implementation: VisualizationInterpreters.ebbColorViz,
                id: 1
            },
            {
                name: 'Velocity as Thickness (EBB)',
                description: 'Movement lines with thickness proportional to'
                             + ' velocity.',
                isa: 'ebb',
                implementation: VisualizationInterpreters.ebbVelocityThicknessViz,
                id: 2
            },
            {
                name: 'Colored Travel vs Draw (G-code)',
                description: 'Travel and plot lines encoded by color.',
                isa: 'gcode',
                implementation: VisualizationInterpreters.gcodeColorViz,
                id: 3
            }
        ];
        let maybeSavedInterpreterName = this.loadSavedValue();
        this.state = {
            machine: new verso.Machine('TEMP'),
            toolpath: new verso.Toolpath('', []),
            visualizationSpace: undefined,
            currentInterpreterId: maybeSavedInterpreterName
                                    || 0,
            windowOpen: props.windowOpen,
            valueSet: !!maybeSavedInterpreterName,
            selectedInstIndex: -1
        };
    }

    get currentInterpreter() {
        return this.interpreters.find(i => i.id === this.state.currentInterpreterId);
    }

    async setArguments(machine: verso.Machine,
                       toolpath: verso.Toolpath,
                       visualizationSpace: verso.VisualizationSpace) {
        return new Promise<void>((resolve) => {
            this.setState(_ => {
                return {
                    machine: machine,
                    toolpath: toolpath,
                    visualizationSpace: visualizationSpace
                };
            }, resolve);
        });
    }

    saveValue() {
        localStorage.setItem(this.functionName,
                             this.state.currentInterpreterId.toString());
        this.setState((prevState) => ({ valueSet: true }));
    }

    loadSavedValue() {
        let maybeId = localStorage.getItem(this.functionName);
        if (maybeId) {
            return parseInt(maybeId);
        }
    }

    setInterpreterFromClick (event: React.MouseEvent<HTMLDivElement, MouseEvent>) {
        let interpreterItemDom = event.target as HTMLDivElement;
        let interpreterId = interpreterItemDom.dataset.interpreterId;
        if (interpreterId && !!parseInt(interpreterId)) {
            this.renderWithInterpreter(parseInt(interpreterId));
        }
    }

    renderWithInterpreter(interpreterId: number) {
        if (!this.state.visualizationSpace) {
            throw Error('Cannot set interpreter without viz space.');
        }
        this.state.visualizationSpace.removeAllViz();
        // let interpreter = eval(`VisualizationInterpreters.${interpreterName}`);
        let interpreter = this.currentInterpreter;
        if (!interpreter) { throw new Error(); }
        let vizGroup = interpreter.implementation(this.state.toolpath);
        this.state.visualizationSpace.addVizWithName(vizGroup, interpreter.name);
        this.setState((prevState) => {
            return {
                currentInterpreterId: interpreterId
            };
        }, () => this.saveValue());
    }

    componentDidUpdate() {
        let implementationDom = document.getElementById('viz-implementation-box');
        if (implementationDom) {
            // FIXME: this results in an unescaped HTML warning from react
            // which then seems to freeze the implementation shown. See if
            // we can fix later if there's time.
            // hljs.highlightElement(implementationDom);
        }
    }

    expand() : string {
        let s = `async function ${this.functionName}(machine, toolpath, vizSpace) {`;
        s += `let tv = PROGRAM_PANE.getLivelitWithName(\'${this.functionName}\');`;
        s += `await tv.setArguments(machine, toolpath, vizSpace);`;
        s += `tv.renderWithInterpreter(tv.state.currentInterpreterId);`;
        s += `return vizSpace;`;
        s += `}`;
        return s;
    }

    async finishDeployment() : Promise<void>{
        return new Promise<void>((resolve) => {
            const doneDom = document.getElementById('done-toolpath-visualizer');
            if (doneDom) {
                doneDom.addEventListener('click', (event) => {
                    resolve();
                });
            }
        });
    }

    renderToolpathInstructions() {
        let instElements : JSX.Element[] = [];
        if (this.state.toolpath) {
            instElements = this.state.toolpath.instructions
                .map((inst, idx) => {
                let maybeHighlight = this.state.selectedInstIndex === idx
                                     ? 'highlight' : '';
                return (
                    <div className={`inst-list-item ${maybeHighlight}`}
                         key={idx}>{inst}</div>
                );
            });
        }
        return (
            <div id="inst-list" className="boxed-list">{ instElements }</div>
        );
    }

    renderMachineParams() {
        return (
            <div id="machine-param-list" className="boxed-list">
                <div className="machine-param">
                <span className="param-key">Pen Height</span>
                <span className="param-value">33mm</span>
                </div>
            </div>
        );
    }

    renderVizInterpreters() {
        let interpreterDoms = this.interpreters
                                  .map((interpreter: VisualizerInterpreter,
                                        idx: number) => {
            let maybeHighlight = interpreter.id === this.state.currentInterpreterId
                                ? 'highlight' : '';
            return (
                <div className={`viz-interpreter-item ${maybeHighlight}`}
                     key={idx}
                     data-interpreter-id={interpreter.id}
                     onClick={this.setInterpreterFromClick.bind(this)}>
                    <span className="interpreter-name param-key"
                          data-interpreter-id={interpreter.id}>
                         { interpreter.name }
                    </span>
                    <span className="geometry-input param-value"
                          data-interpreter-id={interpreter.id}>
                         { interpreter.description }
                    </span>
                </div>
            );
        });
        return (
            <div id="cam-compiler-list" className="boxed-list">
                { interpreterDoms }
            </div>
        );
    }

    renderImplementation() {
        let interpreter = this.currentInterpreter;
        let functionText = interpreter ? interpreter.implementation.toString()
                                       : '';
        return (
            <pre id="viz-implementation-box" className="code-box"><code>
                {functionText}
            </code></pre>
        );
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let hiddenIffUnset = this.state.valueSet ? '' : 'hidden';
        // TODO: have set visualizations modify state and the render... or not
        let interpreterName = this.currentInterpreter?.name || 'Unknown';
        let display = `Interpreter(${interpreterName})`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
                 { display }
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return (
            <div className={`toolpath-visualizer content ${maybeHidden}`}
                 key={this.contentKey.toString()}>
                <div className="bold-text">Visualization Interpreters</div>
                { this.renderVizInterpreters() }
                <div className="bold-text">Implementation</div>
                { this.renderImplementation() }
           </div>
       );
    }
}

interface MachineInitializerProps extends LivelitProps {
    ref: React.RefObject<MachineInitializer>;
};

interface MachineInitializerState extends LivelitState {
    initialized: boolean;
    connected: boolean;
    axisUHomed: boolean;
    axisXHomed: boolean;
    axisYHomed: boolean;
    axisZHomed: boolean;
};

class MachineInitializer extends LivelitWindow {
    props: MachineInitializerProps;
    state: MachineInitializerState;

    constructor(props: MachineInitializerProps) {
        super(props);
        this.titleText = 'Machine Initializer';
        this.functionName = '$machineInitializer';
        this.props = props;
        this.state = {
            windowOpen: props.windowOpen,
            valueSet: false,
            initialized: false,
            connected: false,
            axisUHomed: false,
            axisXHomed: false,
            axisYHomed: false,
            axisZHomed: false,
        };
    }

    expand() : string {
        let s = `async function ${this.functionName}(machine) {`;
        s += `let d = PROGRAM_PANE.getLivelitWithName(\'${this.functionName}\');`;
        s += `return machine;`;
        s += `}`;
        return s;
    }

    saveValue() {
        return new Promise<void>((resolve) => {
            // TODO
            resolve();
        });
    }

    loadSavedValue() {
            // TODO
        return undefined;
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    valueSet: false
                }
            }, resolve);
        });
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let display = `Machine(initialized: maybe)`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
                 { display }
            </div>
        );
    }

    placeholder() {
        return 42;
    }

    renderSnippet(snippetText: string) {
        return (
            <pre id="viz-implementation-box" className="code-box"><code>
                { snippetText }
            </code></pre>
            );
    }

    grayIffUnconnected() {
        return this.state.connected ? '' : 'grayed';
    }

    grayIffUAxisNotHomed() {
        return this.state.axisUHomed ? '' : 'grayed';
    }

    grayIffYAxisNotHomed() {
        return this.state.axisYHomed ? '' : 'grayed';
    }

    grayIffZAxisNotHomed() {
        return this.state.axisZHomed ? '' : 'grayed';
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return <div className={`tabletop-calibrator content ${maybeHidden}`}
                    key={this.contentKey.toString()}>
                   <div className="subtitle">
                       Machine Initialized? {
                           this.state.initialized ? 'Yes' : 'No'
                       }
                   </div>
                   <div className="help-text">
                       1. Connect to the machine.
                   </div>
                   { this.renderSnippet(this.placeholder.toString()) }
                   <div onClick={this.placeholder.bind(this)}
                        className="button" id="mi-connect">
                       Send Code
                   </div>
                   <div className="help-text">
                       2. Home the U axis.
                   </div>
                   { this.renderSnippet(this.placeholder.toString()) }
                   <div onClick={this.placeholder.bind(this)}
                        className={`button ${this.grayIffUnconnected()}`} id="mi-home-u">
                       Send Code
                   </div>
                   <div className="help-text">
                       3. Home the Y axis.
                   </div>
                   { this.renderSnippet(this.placeholder.toString()) }
                   <div onClick={this.placeholder.bind(this)}
                        className={`button ${this.grayIffUAxisNotHomed()}`} id="mi-home-y">
                       Send Code
                   </div>
                   <div className="help-text">
                       4. Home the Z axis.
                   </div>
                   { this.renderSnippet(this.placeholder.toString()) }
                   <div onClick={this.placeholder.bind(this)}
                        className={`button ${this.grayIffYAxisNotHomed()}`} id="mi-home-z">
                       Send Code
                   </div>
                   <div className="help-text">
                       5. Home the X axis.
                   </div>
                   { this.renderSnippet(this.placeholder.toString()) }
                   <div onClick={this.placeholder.bind(this)}
                        className={`button ${this.grayIffYAxisNotHomed()}`} id="mi-home-x">
                       Send Code
                   </div>
                   { this.applyButton }
               </div>;
    }
}

type MachineState = 'free' | 'busy'

interface DispatcherProps extends LivelitProps {
    ref: React.RefObject<Dispatcher>;
};

interface DispatcherState extends LivelitState {
    machine?: verso.Machine;
    toolpaths?: verso.Toolpath[];
    currentToolpathIndex: number;
    machineState: MachineState;
};

class Dispatcher extends LivelitWindow {
    props: DispatcherProps;
    state: DispatcherState;

    constructor(props: DispatcherProps) {
        super(props);
        this.titleText = 'Dispatcher';
        this.functionName = '$dispatcher';
        this.props = props;
        this.state = {
            windowOpen: props.windowOpen,
            valueSet: false,
            machine: undefined,
            toolpaths: undefined,
            currentToolpathIndex: 0,
            machineState: 'free'
        };
    }

    get currentToolpath() {
        if (!this.state.toolpaths || this.state.toolpaths.length === 0) {
            return null;
        }
        return this.state.toolpaths[this.state.currentToolpathIndex];
    }

    private __expandHelper(machine: verso.Machine, toolpaths: verso.Toolpath[]) {
        if (!toolpaths.length) {
            console.error('Dispatcher needs an array of toolpaths.');
            return;
        }
        // @ts-ignore
        let mc: typeof this = PROGRAM_PANE.getLivelitWithName(FUNCTION_NAME_PLACEHOLDER);
        mc.setState(_ => ({ machine: machine, toolpaths: toolpaths }));
        return undefined;
    }

    expand() : string {
        let fnString = this.__expandHelper.toString();
        fnString = fnString.replace('__expandHelper', this.functionName);
        fnString = fnString.replace('FUNCTION_NAME_PLACEHOLDER', `\'${this.functionName}\'`);
        fnString = 'async function ' + fnString;
        return fnString;
    }

    saveValue() {
        return new Promise<void>((resolve) => {
            // TODO
            resolve();
        });
    }

    loadSavedValue() {
            // TODO
        return undefined;
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    valueSet: false
                }
            }, resolve);
        });
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let display = `Machine(initialized: maybe)`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
                 { display }
            </div>
        );
    }

    renderMachineState() {
        return (
            <div></div>
        );
    }

    renderTerminal() {
        return (
            <div></div>
        );
    }

    placeholder() {
    }

    renderToolpathChoices() {
        if (!this.state.toolpaths) {
            return;
        }
        let interpreterDoms = this.state.toolpaths
                                  .map((tp: verso.Toolpath,
                                        idx: number) => {
            let maybeHighlight = idx === this.state.currentToolpathIndex
                                ? 'highlight' : '';
            return (
                <div className={`viz-interpreter-item ${maybeHighlight}`}
                     key={idx}
                     data-toolpath-index={idx}
                     onClick={this.placeholder.bind(this)}>
                    <span className="interpreter-name param-key"
                          data-interpreter-id={idx}>
                         { `Toolpath ${idx}` }
                    </span>
                </div>
            );
        });
        return (
            <div id="cam-compiler-list" className="boxed-list">
                { interpreterDoms }
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return (
            <div className={`dispatcher content ${maybeHidden}`}>
                { this.renderMachineState() }
                { this.renderToolpathChoices() }
                { this.renderTerminal() }
            </div>
        );
    }
}

interface DisplayProps extends LivelitProps {
    ref: React.RefObject<Display>;
};

interface DisplayState extends LivelitState {
    displayValue: string;
};

class Display extends LivelitWindow {
    props: DisplayProps;
    state: DisplayState;

    constructor(props: DisplayProps) {
        super(props);
        this.titleText = 'Display';
        this.functionName = '$display';
        this.props = props;
        this.state = {
            windowOpen: props.windowOpen,
            valueSet: false,
            displayValue: 'nothing'
        };
    }

    // FIXME: this doesn't properly apply saved homographies yet
    expand() : string {
        let s = `async function ${this.functionName}(value) {`;
        s += `let d = PROGRAM_PANE.getLivelitWithName(\'${this.functionName}\');`;
        s += `d.setState(_ => ({ displayValue: JSON.stringify(value) }));`
        s += `return value;`;
        s += `}`;
        return s;
    }

    saveValue() {
        return new Promise<void>((resolve) => {
            // TODO
            resolve();
        });
    }

    loadSavedValue() {
            // TODO
        return undefined;
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    valueSet: false
                }
            }, resolve);
        });
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let display = `Machine(initialized: maybe)`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
            </div>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return (
            <div className={`machine-initializer content ${maybeHidden}`}>
                { JSON.stringify(this.state.displayValue) || 'nothing' }
            </div>
        );
    }
}

interface MiniCamProps extends LivelitProps {
    ref: React.RefObject<MiniCam>;
};

interface MiniCamState extends LivelitState {
    gCode: string[];
    geometries: verso.Geometry[];
    selectedGeometryIndex: number;
};

class MiniCam extends LivelitWindow {
    props: MiniCamProps;
    state: MiniCamState;

    constructor(props: MiniCamProps) {
        super(props);
        this.titleText = 'MiniCam';
        this.functionName = '$miniCam';
        this.props = props;
        this.state = {
            windowOpen: props.windowOpen,
            valueSet: false,
            selectedGeometryIndex: 0,
            geometries: [],
            gCode: []
        };
    }

    get selectedGeometry() {
        let index = this.state.selectedGeometryIndex;
        if (index >= this.state.geometries.length) {
            return undefined;
        }
        return this.state.geometries[index];
    }

    private __expandHelper(geometry: verso.Geometry) {
        // @ts-ignore
        let mc: typeof this = PROGRAM_PANE.getLivelitWithName(FUNCTION_NAME_PLACEHOLDER);
        let cam = new Cam(geometry);
        let gCode = cam.getGcode();
        let tp = new verso.Toolpath(geometry.filepath || '', gCode);
        mc.setState(_ => ({ gCode: gCode, geometries: [geometry] }));
        return tp;
    }

    expand() : string {
        let fnString = this.__expandHelper.toString();
        fnString = fnString.replace('__expandHelper', this.functionName);
        fnString = fnString.replace('FUNCTION_NAME_PLACEHOLDER', `\'${this.functionName}\'`);
        fnString = 'async function ' + fnString;
        return fnString;
    }

    saveValue() {
        return new Promise<void>((resolve) => {
            // TODO
            resolve();
        });
    }

    loadSavedValue() {
            // TODO
        return undefined;
    }

    clearSavedValue() {
        return new Promise<void>((resolve) => {
            localStorage.removeItem(this.functionName);
            this.setState(_ => {
                return {
                    valueSet: false
                }
            }, resolve);
        });
    }

    renderValue() {
        let grayedIffUnset = this.state.valueSet ? '' : 'grayed';
        let display = `Machine(initialized: maybe)`;
        return (
            <div className={`module-value ${grayedIffUnset}`}
                 key={`${this.titleKey}-value`}>
                 { display }
            </div>
        );
    }

    renderInstructions() {
        let instElements : JSX.Element[] = [];
        if (this.state.gCode) {
            instElements = this.state.gCode
                .map((inst, idx) => {
                return (
                    <div className={`inst-list-item`}
                         key={idx}>{inst}</div>
                );
            });
        }
        return (
            <div id="inst-list" className="boxed-list">{ instElements }</div>
        );
    }

    handleParamChange() {
    }

    renderGalleryItem(geometry: verso.Geometry) {
        // const maybeHighlight = this.state.selectedUrl === url
        //                        ? 'gallery-highlight' : '';
        const maybeHighlight = 'gallery-highlight';
        return <div className={`gallery-item ${maybeHighlight}`}
                    data-geometry-name={name}
                    // onClick={this.setSelectedGeometryUrlAndRerun.bind(this, url)}
                    key={geometry.filename}>
                    <img src={geometry.filepath}
                         className="gallery-image"/>
               </div>;
    }

    renderGeometries() {
        let galleryItems = this.state.geometries.map((geometry) => {
            return this.renderGalleryItem(geometry);
        });
        return (
            <div className="gallery">
                { galleryItems }
            </div>
        );
    }

    renderControls() {
        return (
            <form onChange={this.handleParamChange.bind(this)}>
                <input type="radio" name="op-type" id="mini-cam-radio-engrave"
                       value="engrave" defaultChecked={true}/>
                <label htmlFor="mini-cam-radio-engrave">Engrave</label>
                <input type="radio" name="op-type" id="mini-cam-radio-pocket"
                       value="pocket"/>
                <label htmlFor="mini-cam-radio-Pocket">Pocket</label><br/>
                <label htmlFor="mini-cam-depth">Top Height</label>
                <input type="text" id="mini-cam-top" placeholder="15"/><br/>
                <label htmlFor="mini-cam-depth">Depth Height</label>
                <input type="text" id="mini-cam-depth" placeholder="5"/><br/>
                <label htmlFor="mini-cam-depth">Cut Speed</label>
                <input type="text" id="mini-cam-cut-speed" placeholder="5"/><br/>
                <label htmlFor="mini-cam-depth">Plunge Speed</label>
                <input type="text" id="mini-cam-plunge-speed" placeholder="5"/><br/>
            </form>
        );
    }

    renderContent() {
        let maybeHidden = this.state.windowOpen ? '' : 'hidden';
        return (
            <div className={`mini-cam content ${maybeHidden}`}>
                { this.renderGeometries() }
                <div className="subtitle">Parameters for: {this.selectedGeometry?.filename}</div>
                { this.renderControls() }
                { this.renderInstructions() }
            </div>
        );
    }
}

export { ProgramPane };
