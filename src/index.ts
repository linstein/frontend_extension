import {
    JupyterFrontEnd,
    JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import {NotebookStatus} from "./status"

import {
    INotebookTracker,
    Notebook,
    NotebookPanel
} from '@jupyterlab/notebook';

import {CommandIDs, NotebookActions, getCookie,createKernelInfo} from "./actions"
import {Session} from '@jupyterlab/services';
import {
    ToolbarButton
} from '@jupyterlab/apputils';
import {
    addIcon,
    runIcon,
    stopIcon
} from '@jupyterlab/ui-components';

import {CodeMirrorEditor} from '@jupyterlab/codemirror'
import {Cell,ICellModel} from "@jupyterlab/cells"
import { IDragEvent } from '@lumino/dragdrop';
import { ArrayExt, each } from '@lumino/algorithm';
import * as nbformat from '@jupyterlab/nbformat';
import {
  ReadonlyPartialJSONObject
} from '@lumino/coreutils';
/**
 * Initialization data for the try extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
    id: 'try',
    autoStart: true,
    requires: [INotebookTracker],
    activate: (
        app: JupyterFrontEnd,
        notebooks: INotebookTracker,
    ): void => {
        const panel_status={ NotebookPanel : NotebookStatus};
        app.commands.addCommand(CommandIDs.runcells, {
                label: 'Run selected cells',
                execute: args => {
                const current = getCurrent(args);
                const status=getStatus(current);
                  if (current.content) {
                    return NotebookActions.run(status.comm,current.content, current.sessionContext);
                  }
                }
              });
            // Set enter key for console completer select command.
            app.commands.addKeyBinding({
              command: CommandIDs.runcells,
              keys: ['Ctrl Enter'],
              selector: '.jp-Notebook'
            });

            app.commands.addCommand(CommandIDs.runandadvance,{
                label: 'Run selected cells and advance',
                execute: args => {
                const current = getCurrent(args);
                const status=getStatus(current);
                  if (current) {
                    return NotebookActions.runAndAdvance(status.comm,current.content, current.sessionContext);
                  }
                }
              });
            // Set enter key for console completer select command.
            app.commands.addKeyBinding({
              command: CommandIDs.runandadvance,
              keys: ['Shift Enter'],
              selector: '.jp-Notebook'
            });

        function getCurrent(args: ReadonlyPartialJSONObject): NotebookPanel | null {
            const widget = notebooks.currentWidget;
            const activate = args['activate'] !== false;

            if (activate && widget) {
              app.shell.activateById(widget.id);
            }
            return widget;
        }

        function getStatus(panel: NotebookPanel):  NotebookStatus | null{
            // @ts-ignore
            const status=panel_status[panel];
            return status
        }

        notebooks.widgetAdded.connect((sender, panel) => {
            console.log('JupyterLab extension try is activated!');
            let notebook_status = new NotebookStatus(panel);
            // @ts-ignore
            panel_status[panel]=notebook_status
            //清空原toolbar下的按键，绑定新的按键以及命令
            let i = 0;
            while (i < 10) {
                panel.toolbar.node.removeChild(panel.toolbar.node.firstChild)
                i++;
            }
            const codebutton = new ToolbarButton({
                icon: addIcon,
                onClick: () => {
                    NotebookActions.insertBelow(panel.content, 'markdown', notebook_status.comm);
                },
                tooltip: 'Insert a markdown cell below'
            });
            panel.toolbar.insertItem(
                0,
                app.commands.label(CommandIDs.insertcodeBelow),
                codebutton
            );

            const markdownbutton = new ToolbarButton({
                icon: addIcon,
                onClick: () => {
                    NotebookActions.insertBelow(panel.content, 'code', notebook_status.comm);
                },
                tooltip: 'Insert a code cell below'
            });
            panel.toolbar.insertItem(
                1,
                app.commands.label(CommandIDs.insertmarkdownBelow),
                markdownbutton
            );

            const runallbutton = new ToolbarButton({
                icon: runIcon,
                onClick: () => {
                    void NotebookActions.runAll(notebook_status.comm, panel.content, panel.sessionContext);
                },
                tooltip: 'Run  all cells'
            });
            panel.toolbar.insertItem(
                2,
                app.commands.label(CommandIDs.runall),
                runallbutton
            );

            const runbutton = new ToolbarButton({
              icon: runIcon,
              onClick: () => {
                void NotebookActions.runAndAdvance(notebook_status.comm,panel.content, panel.sessionContext);
              },
              tooltip: 'Run the selected cells and advance'
            });
            panel.toolbar.insertItem(
                3,
                "runcell",
                runbutton
            );

            panel.toolbar.insertAfter(
                "spacer",
                "kernelinfo",
                createKernelInfo()
            );

            const interruptbutton =  new ToolbarButton({
              icon: stopIcon,
              onClick: () => {
                void panel.sessionContext.session?.kernel?.interrupt();
              },
              tooltip: 'Interrupt kernel'
            })

          panel.toolbar.insertItem(
                6,
                "interruptkernel",
                interruptbutton
            );

            const deletebutton = new ToolbarButton({
                icon: stopIcon,
                onClick: () => {
                    void panel.sessionContext.shutdown();
                },
                tooltip: 'shutdown the session and kernel'
            })
            panel.toolbar.insertItem(
                7,
                "delete",
                deletebutton
            );

            panel.content.node.removeEventListener("lm-drop",panel.content,true);
            panel.content.node.addEventListener('lm-drop',evtDrop,true);

            function evtDrop(event: Event): void {
                console.log("drop")
                const dragevent=event as IDragEvent;
                if(dragevent.type=="lm-drop"){
                    if (!dragevent.mimeData.hasData('application/vnd.jupyter.cells')) {
                        return;
                    }
                    dragevent.preventDefault();
                    dragevent.stopPropagation();
                    if (dragevent.proposedAction === 'none') {
                        dragevent.dropAction = 'none';
                        return;
                    }

                    let target = dragevent.target as HTMLElement;
                    while (target && target.parentElement) {
                        if (target.classList.contains('jp-mod-dropTarget')) {
                            target.classList.remove('jp-mod-dropTarget');
                            break;
                        }
                        target = target.parentElement;
                    }

                    // Model presence should be checked before calling event handlers
                    const model = panel.content.model!;

                    const source: Notebook = dragevent.source;
                    if (source === panel.content) {
                        // Handle the case where we are moving cells within
                        // the same notebook.
                        dragevent.dropAction = 'move';
                        const toMove: Cell[] = dragevent.mimeData.getData('internal:cells');

                        // Compute the to/from indices for the move.
                        let fromIndex = ArrayExt.firstIndexOf(panel.content.widgets, toMove[0]);
                        let toIndex = findCell(target);
                        // This check is needed for consistency with the view.
                        if (toIndex !== -1 && toIndex > fromIndex) {
                            toIndex -= 1;
                        } else if (toIndex === -1) {
                            // If the drop is within the notebook but not on any cell,
                            // most often this means it is past the cell areas, so
                            // set it to move the cells to the end of the notebook.
                            toIndex = panel.content.widgets.length - 1;
                        }
                        // Don't move if we are within the block of selected cells.
                        if (toIndex >= fromIndex && toIndex < fromIndex + toMove.length) {
                            return;
                        }

                        // Move the cells one by one
                        model.cells.beginCompoundOperation();
                        console.log("from: "+fromIndex+" to: "+toIndex);
                        if (fromIndex < toIndex) {
                            each(toMove, cellWidget => {
                                model.cells.move(fromIndex, toIndex);
                                //send(msg)
                                console.log("move down");
                                dragcellMsg(fromIndex, toIndex)
                            });
                        } else if (fromIndex > toIndex) {
                            each(toMove, cellWidget => {
                                model.cells.move(fromIndex++, toIndex++);
                                //send(msg)
                                console.log("move up");
                                dragcellMsg(fromIndex-1, toIndex-1)
                            });
                        }
                        model.cells.endCompoundOperation();
                    } else {
                        // Handle the case where we are copying cells between
                        // notebooks.
                        dragevent.dropAction = 'copy';
                        // Find the target cell and insert the copied cells.
                        let index = findCell(target);
                        if (index === -1) {
                            index = panel.content.widgets.length;
                        }
                        const start = index;
                        const values = dragevent.mimeData.getData('application/vnd.jupyter.cells');
                        const factory = model.contentFactory;

                        // Insert the copies of the original cells.
                        model.cells.beginCompoundOperation();
                        each(values, (cell: nbformat.ICell) => {
                            let value: ICellModel;
                            switch (cell.cell_type) {
                                case 'code':
                                    value = factory.createCodeCell({cell});
                                    break;
                                case 'markdown':
                                    value = factory.createMarkdownCell({cell});
                                    break;
                                default:
                                    value = factory.createRawCell({cell});
                                    break;
                            }
                            model.cells.insert(index++, value);
                        });
                        model.cells.endCompoundOperation();
                        // Select the inserted cells.
                        panel.content.deselectAll();
                        panel.content.activeCellIndex = start;
                        panel.content.extendContiguousSelectionTo(index - 1);
                    }

                }

            }

            function dragcellMsg(from: number, to: number) {
                const sendx = {'cellid': '', "from": from, "to": to, 'func': 'sync', 'spec': 'drag_cell'};
                notebook_status.comm!.send(sendx)
            };
            function findCell(node: HTMLElement): number {
                // Trace up the DOM hierarchy to find the root cell node.
                // Then find the corresponding child and select it.
                let n: HTMLElement | null = node;
                while (n && n !== panel.content.node) {
                  if (n.classList.contains('jp-Notebook-cell')) {
                    const i = ArrayExt.findFirstIndex(
                      panel.content.widgets,
                      widget => widget.node === n
                    );
                    if (i !== -1) {
                      return i;
                    }
                    break;
                  }
                  n = n.parentElement;
                }
                return -1;
              }



            //给activecell绑定事件
            let onActiveCellChanged = () => {
                console.log("onActiveCellChanged---------------------------------------")
                const activeCell = notebooks.activeCell;
                const cellModel = activeCell?.model;
                cellModel.value.changed.connect(_onValueChanged, panel);
                const editor = activeCell.editor as CodeMirrorEditor;
                editor.handleEvent = (event: Event, cell: Cell = activeCell) => {
                    switch (event.type) {
                        case 'focus':
                            focusmsg(cell)
                            break;
                        case 'blur':
                            blurmsg(cell)
                            break;
                        default:
                            break;
                    }
                }
            }

            function focusmsg(cell: Cell) {
                if (notebook_status.comm !== null) {
                    let cellid = ''
                    if (cell.model.metadata.get('id')) {
                        cellid = cell.model.metadata.get('id')!.toString();
                    }
                    const sendx = {
                        'cellid': cellid,
                        'func': 'sync',
                        'spec': 'lockcell',
                        "username": getCookie("username"),
                        "avatar": JSON.parse(getCookie("avatar"))
                    };
                    notebook_status.comm!.send(sendx);
                    Object.assign(cell!.node.style, {background: '#F7EED6'});
                    cell.editor.host.style.background = '#F7EED6';
                }
            }

            function blurmsg(cell: Cell) {
                if (notebook_status.comm !== null) {
                    let cellid = ''
                    if (cell.model.metadata.get('id')) {
                        cellid = cell.model.metadata.get('id')!.toString();
                    }
                    const sendx = {'cellid': cellid, 'func': 'sync', 'spec': 'unlockcell'};
                    notebook_status.comm!.send(sendx);
                    Object.assign(cell!.node.style, {background: '#F7EED6'});
                    cell.editor.host.style.background = '#F7EED6';
                }
            }

            //监听cell变化并绑定txt同步信息发送
            let _onValueChanged = () => {
                if (panel.content.activeCell !== null) {
                    const editor = panel.content.activeCell?.editor;
                    if (editor!.hasFocus() && panel.content.activeCell!.readOnly == false) {
                        const txt = editor.model!.value.text;
                        let cellid: string;
                        if (panel.content.activeCell.model.metadata.get('id')) {
                            cellid = panel.content.activeCell.model.metadata.get('id')!.toString();
                        }
                        const sendx = {
                            'cellid': cellid,
                            'txt': txt,
                            'func': 'sync',
                            'spec': 'txt'
                        };
                        console.log(sendx)
                        if (notebook_status.comm !== null) {
                            notebook_status.comm!.send(sendx);
                        } else {
                            console.log('no comm')
                        }
                    }
                }
            }
            // Update the handler whenever the prompt or session changes
            panel.content.activeCellChanged.connect(onActiveCellChanged);

            //更换kernel新建cell通道
            panel.sessionContext.kernelChanged.connect((sender: any,
                                                        args: Session.ISessionConnection.IKernelChangedArgs) => {
                if (!panel.model || !args.newValue) {
                    return;
                }

                if (notebook_status.comm !== null && !notebook_status.comm.isDisposed && !panel.sessionContext.session!.kernel!.isDisposed) {
                    notebook_status.comm!.close();
                }
                notebook_status.comm = null;
                console.log("kernel_chanege")
                notebook_status.create_comm(panel)
            });

        // });

    });
    }
};

export default extension;
