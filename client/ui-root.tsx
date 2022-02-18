import { ProgramPane } from "./program-pane.js";

interface Props {};
interface State {};
interface UIRootProps {
    programPaneRef: React.Ref<ProgramPane>
};
interface UIRootState {
    programPaneRef: React.Ref<ProgramPane>
    currentWorkflowName: string;
    workflowDict: Record<string, string>;
};
interface Workflow {
    progName: string;
    progText: string;
};

class UIRoot extends React.Component<UIRootProps, UIRootState> {
    rerunTimeout: number;

    constructor(props: UIRootProps) {
        super(props);
        this.rerunTimeout = 0;
        this.state = {
            programPaneRef: props.programPaneRef,
            currentWorkflowName: '',
            workflowDict: {}
        }
    }

    componentDidMount() {
        // At this point, paper should have already initialized and we should
        // have a valid ref to program pane
        let programPaneRef = this.state.programPaneRef as React.RefObject<ProgramPane>;
        if (!(programPaneRef && programPaneRef.current)) {
            return;
        }
        let programPane = programPaneRef.current;
        // Now fetch the workflow text from the server
        this.populateWorkflows();
        // Once we have text, do the rest of the setup
        programPane.bindNativeConsoleToProgramConsole();
        programPane.generateModules()
        .then(() => {
            programPane.runAllLines();
            this.setProgramLinesContentEditable();
            this.setProgramLinesRerunHandler();
        });
    }

    async fetchWorkflows() : Promise<Workflow[]> {
        let url = '/workflows';
        let response = await fetch(url);
        if (response.ok) {
           let resJson = await response.json();
           return resJson['workflows'];
        }
        else {
            return [];
        }
    }

    get currentWorkflowLines() {
        let key = this.state.currentWorkflowName;
        let maybeWorkflow = this.state.workflowDict[key];
        if (maybeWorkflow) {
            let lines = maybeWorkflow.split('\n');
            lines = lines.filter(line => line !== '');
            return lines;
        }
        return [];
    }

    populateWorkflows() {
        let programPaneRef = this.state.programPaneRef as React.RefObject<ProgramPane>;
        if (!(programPaneRef && programPaneRef.current)) {
            return;
        }
        let programPane = programPaneRef.current;
        this.fetchWorkflows().then((workflows: Workflow[]) => {
            let workflowDict : Record<string, string> = {};
            workflows.forEach((workflow) => {
                workflowDict[workflow.progName] = workflow.progText;
            });
            this.setState(_ => {
                let firstWorkflowName = Object.keys(workflowDict)[0];
                return {
                    currentWorkflowName: firstWorkflowName,
                    workflowDict: workflowDict
                };
            }, () => {
                let programPaneLines = this.currentWorkflowLines;
                programPane.renderTextLines(programPaneLines);
                this.rerun();
            });
        });
    }

    setProgramLinesContentEditable() {
        let programLinesDom = document.getElementById('program-lines');
        if (programLinesDom) {
            programLinesDom.contentEditable = "true";
            programLinesDom.spellcheck = false;
        }
    }

    setProgramLinesRerunHandler() {
        const delay = 1000;
        let programLinesDom = document.getElementById('program-lines');
        if (programLinesDom) {
            programLinesDom.addEventListener('keyup', (event: Event) => {
                clearTimeout(this.rerunTimeout);
                this.rerunTimeout = setTimeout(() => {
                    this.rerun();
                }, delay);
            });
        }
    }

    rerun() {
        let programPaneRef = this.state.programPaneRef as React.RefObject<ProgramPane>;
        if (!(programPaneRef && programPaneRef.current)) {
            return;
        }
        let programPane = programPaneRef.current;
        // This might throw a massive security warning. It seems to happen when
        // we highlight lines that were not procedurally generated.
        programPane.syntaxHighlightProgramLines();
        programPane.generateModules()
        .then(() => {
            programPane.runAllLines();
        });
    };

    protected handleWorkflowChange(event: React.ChangeEvent<HTMLSelectElement>) {
        let programPaneRef = this.state.programPaneRef as React.RefObject<ProgramPane>;
        if (!(programPaneRef && programPaneRef.current)) {
            return;
        }
        let programPane = programPaneRef.current;
        let workflowName = event.currentTarget.value;
        this.setState(prevState => {
            return { currentWorkflowName: workflowName };
        }, () => {
            this.rerun();
        });
    }

    renderWorkflowSelect() {
        let programPaneRef = this.state.programPaneRef as React.RefObject<ProgramPane>;
        if (!(programPaneRef && programPaneRef.current)) {
            return;
        }
        let programPane = programPaneRef.current;
        let options = Object.keys(this.state.workflowDict).map((workflowName) => {
            return (
                <option value={workflowName}
                        key={workflowName}>
                    { workflowName }
                </option>
            );
        });
        return (
            <select id="program-names" name="workflow-select"
                    onChange={this.handleWorkflowChange.bind(this)}>
                { options }
            </select>
        );
    }


    render() {
        return (
            <div id="main-container">
                <div id="program-container">
                    { this.renderWorkflowSelect() }
                    <ProgramPane loadedWorkflowLines={this.currentWorkflowLines}
                        ref={this.state.programPaneRef}></ProgramPane>
                </div>
                <div id="visualization-space-container">
                    <div id="visualization-space"></div>
                </div>
                <div id="canvas-container">
                    <PaperCanvas></PaperCanvas>
                </div>
            </div>
        )
    }
}

// NOTE: this will eventually be moved elsewhere probably as it will need
// to be loaded remotely.
class PaperCanvas extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
    }

    componentDidMount() {
        (paper as any).setup('main-canvas');
    }

    render() {
        return <canvas id="main-canvas" className=""></canvas>
    }
}

const inflateUI = () => {
    const blankDom = document.querySelector('#root');
    const programPaneRef = React.createRef<ProgramPane>();
    const uiRoot = <UIRoot programPaneRef={programPaneRef}></UIRoot>;
    ReactDOM.render(uiRoot, blankDom);
};

export { inflateUI };
