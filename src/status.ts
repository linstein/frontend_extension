import {
    NotebookPanel
} from '@jupyterlab/notebook';
import {createCell} from "./actions"
import {Kernel, KernelMessage} from '@jupyterlab/services';

import {UUID} from "@lumino/coreutils";

import {CodeCell, MarkdownCell} from "@jupyterlab/cells"

import * as nbformat from '@jupyterlab/nbformat';

export class NotebookStatus {
    constructor(
        panel: NotebookPanel
    ) {
        this.lock_cells = [];
        this.count_cell = [];
        this.cell_status = {};
        this.execute_cellid = [];
        this.multi_runcell = [];
        this.on_execute = false;
        this.comm = this.create_comm(panel);
        this.on_execute = false;
        this.panel = panel;
    }

    comm: Kernel.IComm | null;
    // private lock_cells: string[];
    cell_status: { [key: string]: { [key: string]: string | number; }; };
    // private maxCellEditTime: number;
    _commid: string;
    lock_cells: string[];

    execute_cellid: string[];
    count_cell: string[];
    multi_runcell: string[];
    on_execute: boolean;
    panel: NotebookPanel;

    create_comm(panel: NotebookPanel): Kernel.IComm | null {
        if (this.comm === null && panel.sessionContext.session !== null) {
            console.log('createcomm msg!!!!!!!!!!!!!!!!!!!!!!!!');
            if (!panel.sessionContext.session!.kernel) {
                throw new Error('Session has no kernel.');
            }
            const comm_id = UUID.uuid4();
            this._commid = comm_id;
            this.comm = panel.sessionContext.session!.kernel!.createComm('test1', comm_id);
            this.comm.open();
            this.comm.onMsg = async msg => {
                console.log(msg);
                const cellid = msg.content.data.cellid!.toString();
                console.log(cellid);
                const specs = msg.content.data.spec;
                switch (specs) {
                    case "createcell":
                        let celltype = msg.content.data.celltype;
                        if (celltype == "code") {
                            const cellcreate = createCell(
                                "code",
                                {'id': cellid!.toString()},
                                panel.content
                            );
                            panel.content.model!.cells.insert(+msg.content.data.index!, cellcreate);
                        } else {
                            const cellcreate = createCell(
                                "markdown",
                                {'id': cellid!.toString()},
                                panel.content
                            );
                            panel.content.model!.cells.insert(+msg.content.data.index!, cellcreate);
                        }
                        panel.content.activeCellIndex++;
                        panel.content.deselectAll();
                        break;
                    case "deletecell":
                        const indexs = msg.content.data.indexs!.toString().split(",");
                        indexs.reverse().forEach(index => {
                            panel.content.model!.cells.remove(+index);
                        });
                        break;
                    case "executecell":
                        console.log("handle sync executecell");
                        const execute_request = {
                            "channel": "shell", "content": {"code": ""}, "header": {
                                "msg_id": msg.content.data.msg_id!.toString(),
                                "msg_type": "execute_request", "date": "", "session": "", "username": "", "version": ""
                            }, "metadata": {}, "parent_header": {}
                        } as KernelMessage.IShellMessage;
                        panel.sessionContext.session!.kernel.sendShellMessage(
                            execute_request,
                            true,
                            false
                        ) as Kernel.IShellFuture<KernelMessage.IExecuteRequestMsg,
                            KernelMessage.IExecuteReplyMsg>;
                        // const future=new KernelShellFutureHandler(()=>{},
                        //     msgs,false,true,panel.sessionContext.session!.kernel);
                        // future.registerMessageHook(this.handle_msg);
                        panel.sessionContext.session!.kernel!.registerMessageHook(msg.content.data.msg_id!.toString(), async msgs => {
                            console.log("whether the cell is execute:  " + this.on_execute);
                            if (this.on_execute &&
                                (KernelMessage.isDisplayDataMsg(msgs) ||
                                    KernelMessage.isUpdateDisplayDataMsg(msgs) ||
                                    KernelMessage.isExecuteResultMsg(msgs) ||
                                    KernelMessage.isErrorMsg(msgs) ||
                                    KernelMessage.isClearOutputMsg(msgs) ||
                                    KernelMessage.isStreamMsg(msgs) ||
                                    KernelMessage.isStatusMsg(msgs) ||
                                    KernelMessage.isExecuteInputMsg(msgs)
                                )
                            ) {
                                console.log("on execute****************");
                                // tslint:disable-next-line:await-promise
                                // const onExecMsg = this.exechandler._onExecMsg()onExecMsg;
                                // tslint:disable-next-line:await-promise
                                await this.onExecMsg(msgs);
                            }
                            return true
                        });
                        this.on_execute = true;
                        this.execute_cellid.push(cellid);
                        console.log(this.execute_cellid);
                        this.multi_runcell.push(cellid);
                        const cellec = panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid) as CodeCell;
                        console.log(cellec.readOnly);
                        cellec.outputArea.model.clear();
                        console.log("cellclear**************");
                        cellec.readOnly = true;
                        cellec!.setPrompt('*');

                        cellec.editor.host.setAttribute('disabled', 'true');
                        Object.assign(cellec!.node.style, {background: '#F7EED6'});
                        cellec.editor.host.style.background = '#F7EED6';

                        var cell_useravatar = msg.content.data.avatar!.toString();
                        var cell_username = msg.content.data.user!.toString();

                        var kernelInfo = document.getElementById('kenelInfo_tool');
                        // @ts-ignore
                        kernelInfo!.getElementsByTagName("text")[0].innerText = cell_username + " 执行cell,已运行1分钟，" + (this.execute_cellid.length - 1).toString() + "个cell等待执行中";
                        // @ts-ignore
                        kernelInfo!.getElementsByTagName("img")[0].src = cell_useravatar;

                        let header = cellec!.node?.getElementsByClassName("jp-CellHeader")[0];
                        (<HTMLInputElement>header).innerText = '';
                        var a = document.createElement("text");
                        var img = document.createElement("img");
                        img.src = cell_useravatar;
                        if (this.execute_cellid.length == 1) {
                            a.innerText = "正在执行,已执行1分钟";
                            this.cell_status[cellid] = {"status": "onexec", "start_time": Date.parse(msg.header.date)};
                        } else {
                            a.innerText = "等待执行";
                            this.cell_status[cellid] = {
                                "status": "waitexec",
                                "start_time": Date.parse(msg.header.date)
                            };
                        }
                        Object.assign((<HTMLInputElement>header).style, {height: "30px", "display": 'block'});
                        Object.assign(a.style, {float: "right"});
                        Object.assign(img.style, {
                            float: "right",
                            "border-radius": "80%",
                            "height": "30px",
                            "overflow": "hidden"
                        });
                        header.appendChild(img);
                        header.appendChild(a);
                        break;
                    case "rendermdcell":
                        const mdcell = panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid) as MarkdownCell;
                        mdcell.rendered = true;
                        mdcell.inputHidden = false;
                        break;
                    case "lockcell":
                        if (this.lock_cells.indexOf(cellid) === -1) {
                            const lockcell = panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid) as CodeCell;
                            // if(this._commid !== msg.content.comm_id){
                            console.log(this.lock_cells);
                            // var cell_username=msg.content.data.username;
                            lockcell!.readOnly = true;
                            Object.assign(lockcell!.node.style, {background: '#808080'});
                            lockcell.editor.host.style.background = '#808080';
                            lockcell!.editor.host.setAttribute('disabled', 'true');
                            this.lock_cells.push(cellid);
                            console.log('change lockcell color!!!!!');
                            // }else{
                            //   Object.assign(lockcell!.node.style, {background:''});
                            //   lockcell.editor.host.style.background='';
                            // }

                            // lockcell!.editor.host.style.background='';
                            this.cell_status[cellid] = {"status": "onedit", "start_time": Date.parse(msg.header.date)};
                            console.log('kaishi111111111111111');
                            let header = lockcell!.node?.getElementsByClassName("jp-CellHeader")[0];
                            var cell_useravatar1 = msg.content.data.avatar!.toString();
                            console.log(cell_useravatar1);
                            (<HTMLInputElement>header).innerText = '';
                            var a1 = document.createElement("text");
                            var img1 = document.createElement("img");
                            img1.src = cell_useravatar1;
                            a1.innerText = "正在编辑,已编辑1分钟";
                            console.log('kaishi2222222222222222');
                            Object.assign((<HTMLInputElement>header).style, {height: "30px", "display": 'block'});
                            Object.assign(a1.style, {float: "right"});
                            Object.assign(img1.style, {
                                float: "right",
                                "border-radius": "80%",
                                "height": "30px",
                                "overflow": "hidden"
                            });
                            header.appendChild(img1);
                            header.appendChild(a1);
                            console.log("添加正在编辑信息");
                        }
                        break;
                    case "unlockcell":
                        if (this.lock_cells.indexOf(cellid) !== -1) {
                            console.log(this.lock_cells);
                            const unlockcell = panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid);
                            // if(this._commid !== msg.content.comm_id){
                            const pos = this.lock_cells.indexOf(cellid);
                            this.lock_cells.splice(pos, 1);
                            unlockcell!.readOnly = false;
                            unlockcell!.editor.host.setAttribute('onclick', '');
                            Object.assign(unlockcell!.node.style, {background: ''});
                            unlockcell!.editor.host.style.background = '';
                            // }
                        }
                        if (this.cell_status[cellid]["status"] !== "onexec" && this.cell_status[cellid]["status"] !== "waitexec") {
                            this.cell_status[cellid] = {"status": "endedit", "start_time": Date.parse(msg.header.date)};
                            // const unlockcell=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid);
                            // // @ts-ignore
                            // let header=unlockcell!.node?.getElementsByClassName("jp-CellHeader")[0];
                            // let headertxt= header.getElementsByTagName("text")[0];
                            // (<HTMLInputElement>headertxt).innerText="1分钟前编辑"
                        }
                        break;
                    case "txt":
                        console.log("receive txt")
                        const celltxt = panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid);
                        if (celltxt) {
                            console.log('find cell by id !!!!!!!!!!!!!!');
                            celltxt!.model.value.text = msg.content.data.txt!.toString();
                        }
                        break;
                    case "drag_cell":
                        const from = +msg.content.data.from!;
                        const to = +msg.content.data.to!;
                        panel.content.model?.cells.move(from, to);
                        break;

                    default:
                        break
                }
            };
        } else {
            return null
        }
    }

    async handle_msg(msg: KernelMessage.IIOPubMessage): Promise<boolean> {
        console.log("whether the cell is execute:  " + this.on_execute);
        if (this.on_execute &&
            (KernelMessage.isDisplayDataMsg(msg) ||
                KernelMessage.isUpdateDisplayDataMsg(msg) ||
                KernelMessage.isExecuteResultMsg(msg) ||
                KernelMessage.isErrorMsg(msg) ||
                KernelMessage.isClearOutputMsg(msg) ||
                KernelMessage.isStreamMsg(msg) ||
                KernelMessage.isStatusMsg(msg) ||
                KernelMessage.isExecuteInputMsg(msg)
            )
        ) {
            console.log("on execute****************");
            // tslint:disable-next-line:await-promise
            // const onExecMsg = this.exechandler._onExecMsg()onExecMsg;
            // tslint:disable-next-line:await-promise
            await this.onExecMsg(msg);
            return true
        }
    }

    async onExecMsg(msg: KernelMessage.IMessage) {
        console.log(msg);
        console.log(this.execute_cellid);
        const execid = this.execute_cellid[0];
        const exec_cell = this.panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === execid) as CodeCell;
        console.log(exec_cell.model.id + "find codecell----------------+++++++++++");
        const model = exec_cell!.outputArea.model;
        const msgType = msg.header.msg_type;
        let output: nbformat.IOutput;
        switch (msgType) {
            case 'execute_result':
            case 'display_data':
            case 'stream':
            case 'error':
                output = {...msg.content, output_type: msgType};
                model.add(output);
                break;
            case 'clear_output':
                const wait = (msg as KernelMessage.IClearOutputMsg).content.wait;
                model.clear(wait);
                break
            case "status":
                msg = msg as KernelMessage.IStatusMsg;
                // @ts-ignore
                console.log(msg.content.execution_state);
                // @ts-ignore
                if (msg.content.execution_state == "idle") {
                    console.log('idle---------------')
                    const count = this.count_cell[0];
                    console.log("exec_count: " + count);
                    exec_cell!.setPrompt(count);
                    // @ts-ignore
                    // exec_cell!.header.node?.getElementsByTagName("text")[0].innerText="执行完毕";
                    // this.cell_status[execid]={"status":"endexec","start_time":Date.parse(msg.header.date)};
                    this.count_cell.splice(0, 1);
                    this.execute_cellid.splice(0, 1);
                    // console.log(this.sessionContext.session!.kernel!.multi_runcell);
                    if (this.execute_cellid.length === 0) {
                        this.on_execute = false;
                        var unexecell: CodeCell;
                        for (var i = 0; i < this.multi_runcell.length; i++) {
                            let cellidx = this.multi_runcell[i];
                            unexecell = this.panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellidx) as CodeCell;
                            console.log("multi_runcell in search        " + cellidx);
                            console.log(unexecell.readOnly);
                            unexecell.readOnly = false;
                            // unexecell.editor.host.setAttribute('onclick','');
                            Object.assign(unexecell!.node.style, {background: '#87CEFA'});
                            unexecell.editor.host.style.background = '#87CEFA';
                        }
                        this.multi_runcell.length = 0;
                        console.log(false);
                        // var kernelInfo=document.getElementById('kenelInfo_tool');
                        // // @ts-ignore
                        // kernelInfo!.getElementsByTagName("text")[0].innerText="空闲中";
                        // // @ts-ignore
                        // kernelInfo!.getElementsByTagName("img")[0].src='';
                    } else {
                        const next_cellid = this.execute_cellid[0];
                        this.cell_status[next_cellid] = {"status": "onexec", "start_time": Date.parse(msg.header.date)};
                        // var next_cell=this.panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === next_cellid) as CodeCell;
                        // @ts-ignore
                        // next_cell!.header.node?.getElementsByTagName("text")[0].innerText="正在执行,已执行1分钟";

                        // var kernelInfo=document.getElementById('kenelInfo_tool');
                        // var cell_username=kernelInfo!.getElementsByTagName("text")[0].innerHTML.split(" ")[0];
                        // // @ts-ignore
                        // kernelInfo!.getElementsByTagName("text")[0].innerText=cell_username+" 执行cell,已运行1分钟，"+(this.execute_cellid.length-1).toString()+"个cell等待执行中";
                    }
                }
                break
            case "execute_input":
                // const replycellid=msg.content.data.cellid!.toString();
                // @ts-ignore
                const exec_count = msg.content.execution_count!.toString();
                this.count_cell.push(exec_count);
                break
            default:
                break;
        }
    }
}

