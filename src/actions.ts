import {
    ICodeCellModel,
    IMarkdownCellModel,
    CodeCellModel,
    MarkdownCellModel,
    MarkdownCell,
    CodeCell,
    CellModel,
    ICellModel,
    Cell
} from '@jupyterlab/cells';

import * as nbformat from '@jupyterlab/nbformat';

import {Kernel, KernelMessage} from '@jupyterlab/services';

import {UUID} from '@lumino/coreutils';

import {ElementExt} from '@lumino/domutils';

import {Signal} from '@lumino/signaling';

import {ArrayExt, toArray} from '@lumino/algorithm';

import {
    Notebook
} from '@jupyterlab/notebook';

import {
    ISessionContext,
    Dialog,
    showDialog
} from '@jupyterlab/apputils';

import { Widget } from '@lumino/widgets';

export namespace CommandIDs {
    export const insertcodeBelow = 'notebook:insert-codecell-below-new';
    export const insertmarkdownBelow = 'notebook:insert-markdowncell-below-new';
    export const runall = 'notebook:run-all-cell';
    export const runandadvance="notebook:run_and_advance"
    export const runcells="notebook:run_cells"
}

export namespace NotebookActions {

    export const executed = new Signal<any, { notebook: Notebook; cell: Cell }>(
        {}
    );

    /**
     * Insert a new code cell below the active cell.
     *
     * @param notebook - The target notebook widget.
     *
     * #### Notes
     * The widget mode will be preserved.
     * This action can be undone.
     * The existing selection will be cleared.
     * The new cell will be the active cell.
     * @param cellType
     * @param comm
     */
    export function insertBelow(notebook: Notebook, cellType: nbformat.CellType = "code", comm: Kernel.IComm | null): void {
        console.debug('insertbelow');
        if (!notebook.model || !notebook.activeCell) {
            return;
        }

        const state = getState(notebook);
        const model = notebook.model;
        const id = UUID.uuid4();
        console.log(id);
        const cell = createCell(
            cellType,
            {'id': id},
            notebook
        );
        model.cells.insert(notebook.activeCellIndex + 1, cell);
        const sendx = {
            'cellid': id,
            "celltype": cellType,
            'index': notebook.activeCellIndex + 1,
            'func': 'sync',
            'spec': 'createcell'
        };
        comm!.send(sendx);
        // Make the newly inserted cell active.
        notebook.activeCellIndex++;
        notebook.deselectAll();
        handleState(notebook, state, true);
    }

    export function runAll(
        comm: Kernel.IComm | null,
        notebook: Notebook,
        sessionContext?: ISessionContext,
    ): Promise<boolean> | null {
        if (!notebook.model || !notebook.activeCell) {
            return Promise.resolve(false);
        }

        const state = getState(notebook);

        notebook.widgets.forEach(child => {
            notebook.select(child);
        });

        const promise = runSelected(comm, notebook, sessionContext);

        handleRunState(notebook, state, true);
        return promise;
    }

    export function runSelected(
        comm: Kernel.IComm | null,
        notebook: Notebook,
        sessionContext?: ISessionContext,
    ): Promise<boolean> | null {
        notebook.mode = 'command';

        let lastIndex = notebook.activeCellIndex;
        const selected = notebook.widgets.filter((child, index) => {
            const active = notebook.isSelectedOrActive(child);

            if (active) {
                lastIndex = index;
            }

            return active;
        });

        let cellListId: string;
        let codecell_length = 0;
        selected.map(child => {
            if (child.model.type == "code" && child.model.value.text.replace(/^\s+|\s+$/g,"") !== "") {
                codecell_length++;
            }
            return child.readOnly == true;
        });
         if (codecell_length !== 0) {
             cellListId = UUID.uuid4();
             const sendx = {
                "cellid": "n",
                'cellListId': cellListId,
                'username': getCookie('username'),
                'func': 'lock_list',
                "cellnum": codecell_length
             };
             comm!.send(sendx);
         }

        notebook.activeCellIndex = lastIndex;
        notebook.deselectAll();

        return Promise.all(
            selected.map(child => runCell(comm, cellListId, notebook, child, sessionContext))
        )
            .then(results => {
                if (notebook.isDisposed) {
                    return false;
                }

                // Post an update request.
                notebook.update();

                return results.every(result => result);
            })
            .catch(reason => {
                if (reason.message === 'KernelReplyNotOK') {
                    selected.map(cell => {
                        // Remove '*' prompt from cells that didn't execute
                        if (
                            cell.model.type === 'code' &&
                            (cell as CodeCell).model.executionCount == null
                        ) {
                            cell.setPrompt('');
                        }
                    });
                } else {
                    throw reason;
                }

                notebook.update();

                return false;
            });
    }

    function runCell(
        comm: Kernel.IComm | null,
        cellListId: string,
        notebook: Notebook,
        cell: Cell,
        sessionContext?: ISessionContext,
    ): Promise<boolean> | null {
        if (cell.readOnly == true) {
            return null
        } else {
            switch (cell.model.type) {
                case 'markdown':
                    (cell as MarkdownCell).rendered = true;
                    cell.inputHidden = false;
                    executed.emit({notebook, cell});
                    const sendx = {
                        'cellid': cell.model.metadata.get("id")!.toString(),
                        'username': getCookie('username'),
                        'func': 'sync',
                        'spec': 'rendermdcell'
                    };
                    comm!.send(sendx);
                    break;
                case 'code':
                    if (sessionContext) {
                        if (sessionContext.isTerminating) {
                            void showDialog({
                                title: 'Kernel Terminating',
                                body: `The kernel for ${sessionContext.session?.path} appears to be terminating. You can not run any cell for now.`,
                                buttons: [Dialog.okButton()]
                            });
                            break;
                        }
                        const deletedCells = notebook.model?.deletedCells ?? [];
                        return CodeCell.execute(cell as CodeCell, sessionContext, {
                            deletedCells,
                            recordTiming: notebook.notebookConfig.recordTiming,
                            cellListId: cellListId
                        })
                            .then(reply => {
                                deletedCells.splice(0, deletedCells.length);
                                if (cell.isDisposed) {
                                    return false;
                                }

                                if (!reply) {
                                    return true;
                                }

                                if (reply.content.status === 'ok') {
                                    const content = reply.content;

                                    if (content.payload && content.payload.length) {
                                        handlePayload(content, notebook, cell);
                                    }

                                    return true;
                                } else {
                                    throw new Error('KernelReplyNotOK');
                                }
                            })
                            .catch(reason => {
                                if (cell.isDisposed || reason.message.startsWith('Canceled')) {
                                    return false;
                                }
                                throw reason;
                            })
                            .then(ran => {
                                if (ran) {
                                    executed.emit({notebook, cell});
                                }

                                return ran;
                            });
                    }
                    (cell.model as ICodeCellModel).clearExecution();
                    break;
                default:
                    break;
            }
            return Promise.resolve(true);
        }

    }

    export function runAndAdvance(
        comm: Kernel.IComm | null,
        notebook: Notebook,
        sessionContext?: ISessionContext,
    ): Promise<boolean> | null {
        if (!notebook.model || !notebook.activeCell) {
            return Promise.resolve(false);
        }

        const state = getState(notebook);
        const promise = runSelected(comm, notebook, sessionContext);
        const model = notebook.model;

        if (notebook.activeCellIndex === notebook.widgets.length - 1) {
            const cellid = UUID.uuid4();
            const cell = createCell(
                "code",
                {"id": cellid},
                notebook
            );
            model.cells.push(cell);
            const sendx = {
                'cellid': cellid,
                'index': notebook.activeCellIndex + 1,
                "celltype": "code",
                'func': 'sync',
                'spec': 'createcell'
            };
            comm!.send(sendx);
            notebook.activeCellIndex++;
            notebook.mode = 'edit';
        } else {
            notebook.activeCellIndex++;
        }
        handleRunState(notebook, state, true);
        return promise;
    }

    export function run(
      comm:Kernel.IComm | null,
    notebook: Notebook,
    sessionContext?: ISessionContext,

  ): Promise<boolean>|null {
    if (!notebook.model || !notebook.activeCell) {
      return Promise.resolve(false);
    }

    const state = getState(notebook);
    const promise = runSelected(comm,notebook, sessionContext);

    handleRunState(notebook, state, false);
    return promise;
  }

}

export interface IState {
    /**
     * Whether the widget had focus.
     */
    wasFocused: boolean;

    /**
     * The active cell before the action.
     */
    activeCell: Cell | null;
}

/**
 * Get the state of a widget before running an action.
 */
export function getState(notebook: Notebook): IState {
    return {
        wasFocused: notebook.node.contains(document.activeElement),
        activeCell: notebook.activeCell
    };
}

export function handleState(
    notebook: Notebook,
    state: IState,
    scrollIfNeeded = false
): void {
    const {activeCell, node} = notebook;

    if (state.wasFocused || notebook.mode === 'edit') {
        notebook.activate();
    }

    if (scrollIfNeeded && activeCell) {
        ElementExt.scrollIntoViewIfNeeded(node, activeCell.node);
    }
}

export function handleRunState(
    notebook: Notebook,
    state: IState,
    scroll = false
): void {
    if (state.wasFocused || notebook.mode === 'edit') {
        notebook.activate();
    }
    if (scroll && state.activeCell) {
        // Scroll to the top of the previous active cell output.
        const rect = state.activeCell.inputArea.node.getBoundingClientRect();

        notebook.scrollToPosition(rect.bottom, 45);
    }
}

export function createCell(type: nbformat.CellType, opts: CellModel.IOptions, notebook: Notebook): ICellModel {
    switch (type) {
        case 'code':
            return createCodeCell(opts, notebook);
        case 'markdown':
            return createMarkdownCell(opts, notebook);
    }
}


export function createCodeCell(options: CodeCellModel.IOptions, notebook: Notebook): ICodeCellModel {
    // options.modelDB = this.modelDB.view(options.id);
    if (options.contentFactory) {
        options.contentFactory = notebook.model.contentFactory.codeCellContentFactory;
    }
    // options.id = UUID.uuid4();
    if (notebook.model.contentFactory.modelDB) {
        if (!options.id) {
            options.id = UUID.uuid4();
            console.log('not given cellid ')
        }
        options.modelDB = notebook.model.contentFactory.modelDB.view(options.id);
    }

    const codecell = new CodeCellModel(options);
    // let metadata=codecell.modelDB.createMap('metadata');
    // metadata.set('id',options.id);
    codecell.metadata.set("id", options.id);
    // codecell.contentChanged.emit(void 0);
    return codecell;
}

export function createMarkdownCell(options: CellModel.IOptions, notebook: Notebook): IMarkdownCellModel {
    if (notebook.model.contentFactory.modelDB) {
        if (!options.id) {
            options.id = UUID.uuid4();
        }
        options.modelDB = notebook.model.contentFactory.modelDB.view(options.id);
    }
    const markdowncell = new MarkdownCellModel(options);
    markdowncell.metadata.set("id", options.id)
    return markdowncell
}

export function getCookie(cname: string): string {
    const name = cname + "=";
    const ca = document.cookie.split(';');
    let i = 0;
    for (i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}

function handlePayload(
    content: KernelMessage.IExecuteReply,
    notebook: Notebook,
    cell: Cell
) {
    const setNextInput = content.payload?.filter(i => {
        return (i as any).source === 'set_next_input';
    })[0];

    if (!setNextInput) {
        return;
    }

    const text = setNextInput.text as string;
    const replace = setNextInput.replace;

    if (replace) {
        cell.model.value.text = text;
        return;
    }

    // Create a new code cell and add as the next cell.
    const newCell = notebook.model!.contentFactory.createCodeCell({});
    const cells = notebook.model!.cells;
    const index = ArrayExt.firstIndexOf(toArray(cells), cell.model);

    newCell.value.text = text;
    if (index === -1) {
        cells.push(newCell);
    } else {
        cells.insert(index + 1, newCell);
    }
}

 export class KernelInfo extends Widget{
  /**
   * Construct a KernelInfo.
   */
  constructor() {
    super();
    this.addClass("KernelInfo");
    var a=document.createElement("text");
    var img=document.createElement("img");
    img.src="";
    Object.assign(this.node,{id:"kenelInfo_tool"});
    // Object.assign(this.node.style, {height:"20px"});
    Object.assign(a.style, {float:"right"});
    Object.assign(img.style, {float:"right", "border-radius":"70%",  "overflow":"hidden"});
    a.innerText="空闲中";
    this.node.appendChild(a);
    this.node.appendChild(img);

  }
}

  export function createKernelInfo(
  ): Widget {
    return new KernelInfo()
  }

