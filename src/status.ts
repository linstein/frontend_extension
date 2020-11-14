import {
  NotebookPanel
} from '@jupyterlab/notebook';
import {createCell} from "./actions"
import { Kernel } from '@jupyterlab/services';

import { UUID } from "@lumino/coreutils";

import {CodeCell,MarkdownCell} from "@jupyterlab/cells"

export class NotebookStatus {
  constructor(
      panel: NotebookPanel
  ) {
    this.lock_cells=[];
    this.comm=this.create_comm(panel);
    this.on_execute=false;
  }

  comm: Kernel.IComm |null;
  // private lock_cells: string[];
  cell_status: {[key: string]: {[key: string]: string|number;};};
  // private maxCellEditTime: number;
  _commid: string;
  lock_cells:string[];

  execute_cellid: string[];
  // count_cell: string[];
  multi_runcell: string[];
  on_execute: boolean;

  create_comm(panel: NotebookPanel): Kernel.IComm|null{
      if (this.comm===null && panel.sessionContext.session!==null){
        console.log('createcomm msg!!!!!!!!!!!!!!!!!!!!!!!!');
        if(!panel.sessionContext.session!.kernel){
          throw new Error('Session has no kernel.');
        }
        const comm_id= UUID.uuid4();
        this._commid=comm_id;
        this.comm = panel.sessionContext.session!.kernel!.createComm('test1',comm_id);
        this.comm.open();
        this.comm.onMsg = async msg => {
          console.log(msg);
          const cellid=msg.content.data.cellid!.toString();
          console.log(cellid);
          const specs=msg.content.data.spec;
          switch (specs) {
            case "createcell":
              let celltype=msg.content.data.celltype;
              if(celltype=="code"){
                const cellcreate = createCell(
                "code",
                {'id':cellid!.toString()}
                );
                panel.content.model!.cells.insert(+msg.content.data.index!, cellcreate);
              }else {
                const cellcreate = createCell(
                "markdown",
                {'id':cellid!.toString()}
                );
                panel.content.model!.cells.insert(+msg.content.data.index!, cellcreate);
              }
              panel.content.activeCellIndex++;
              panel.content.deselectAll();
              break;
            case "deletecell":
              const indexs=msg.content.data.indexs!.toString().split(",");
              indexs.reverse().forEach(index => {
                panel.content.model!.cells.remove(+index);
              });
              break;
            case "executecell":
              console.log("handle sync executecell8888888888888888888");
              this.on_execute=true;
              this.execute_cellid.push(cellid);
              this.multi_runcell.push(cellid);
              const cellec=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid) as CodeCell;
              cellec.readOnly=true;
              cellec!.setPrompt('*');
              cellec.outputArea.model.clear();
              cellec.editor.host.setAttribute('disabled','true');
              Object.assign(cellec!.node.style, {background:'#F7EED6'});
              cellec.editor.host.style.background='#F7EED6';

              var cell_useravatar=msg.content.data.avatar!.toString();
              var cell_username=msg.content.data.user!.toString();

              var kernelInfo=document.getElementById('kenelInfo_tool');
              // @ts-ignore
              kernelInfo!.getElementsByTagName("text")[0].innerText=cell_username+" 执行cell,已运行1分钟，"+(panel.sessionContext.session!.kernel!.execute_cellid.length-1).toString()+"个cell等待执行中";
              // @ts-ignore
              kernelInfo!.getElementsByTagName("img")[0].src=cell_useravatar;

              let header=cellec!.node?.getElementsByClassName("jp-CellHeader")[0];
              (<HTMLInputElement>header).innerText='';
              var a=document.createElement("text");
              var img=document.createElement("img");
              img.src=cell_useravatar;
              if(this.execute_cellid.length==1){
                a.innerText="正在执行,已执行1分钟";
                this.cell_status[cellid]={"status":"onexec","start_time":Date.parse(msg.header.date)};
              }else{
                a.innerText="等待执行";
                this.cell_status[cellid]={"status":"waitexec","start_time":Date.parse(msg.header.date)};
              }
              Object.assign((<HTMLInputElement>header).style, {height:"30px","display":'block'});
              Object.assign(a.style, {float:"right"});
              Object.assign(img.style, {float:"right", "border-radius":"80%", "height": "30px", "overflow":"hidden"});
              header.appendChild(img);
              header.appendChild(a);
              break;
            case "rendermdcell":
              const mdcell=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid) as MarkdownCell;
              mdcell.rendered = true;
              mdcell.inputHidden = false;
              break;
            case "lockcell":
              if(this.lock_cells.indexOf(cellid)===-1){
                const lockcell=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid) as CodeCell;
                // if(this._commid !== msg.content.comm_id){
                console.log(this.lock_cells);
                // var cell_username=msg.content.data.username;
                lockcell!.readOnly=true;
                Object.assign(lockcell!.node.style, {background:'#808080'});
                lockcell.editor.host.style.background='#808080';
                lockcell!.editor.host.setAttribute('disabled','true');
                this.lock_cells.push(cellid);
                console.log('change lockcell color!!!!!');
                // }else{
                //   Object.assign(lockcell!.node.style, {background:''});
                //   lockcell.editor.host.style.background='';
                // }

                // lockcell!.editor.host.style.background='';
                this.cell_status[cellid]={"status":"onedit","start_time":Date.parse(msg.header.date)};
                console.log('kaishi111111111111111');
                let header=lockcell!.node?.getElementsByClassName("jp-CellHeader")[0];
                var cell_useravatar1=msg.content.data.avatar!.toString();
                console.log(cell_useravatar1);
                (<HTMLInputElement>header).innerText='';
                var a1=document.createElement("text");
                var img1=document.createElement("img");
                img1.src=cell_useravatar1;
                a1.innerText="正在编辑,已编辑1分钟";
                console.log('kaishi2222222222222222');
                Object.assign((<HTMLInputElement>header).style, {height:"30px","display":'block'});
                Object.assign(a1.style, {float:"right"});
                Object.assign(img1.style, {float:"right", "border-radius":"80%", "height": "30px", "overflow":"hidden"});
                header.appendChild(img1);
                header.appendChild(a1);
                console.log("添加正在编辑信息");
              }
              break;
            case "unlockcell":
              if(this.lock_cells.indexOf(cellid)!==-1){
                console.log(this.lock_cells);
                const unlockcell=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid);
                // if(this._commid !== msg.content.comm_id){
                const pos=this.lock_cells.indexOf(cellid);
                this.lock_cells.splice(pos,1);
                unlockcell!.readOnly=false;
                unlockcell!.editor.host.setAttribute('onclick','');
                Object.assign(unlockcell!.node.style, {background:''});
                unlockcell!.editor.host.style.background='';
                // }
              }
              if(this.cell_status[cellid]["status"] !== "onexec" &&this.cell_status[cellid]["status"] !== "waitexec" ){
                this.cell_status[cellid]={"status":"endedit","start_time":Date.parse(msg.header.date)};
                // const unlockcell=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid);
                // // @ts-ignore
                // let header=unlockcell!.node?.getElementsByClassName("jp-CellHeader")[0];
                // let headertxt= header.getElementsByTagName("text")[0];
                // (<HTMLInputElement>headertxt).innerText="1分钟前编辑"
              }
              break;
            case "celltype":
              console.log("cell_type");
              // Private.changecelltypebyid(panel.content,msg.content.data.celltype!.toString(),msg.content.data.cellid!.toString(),+msg.content.data.index!);
              break;

            case "txt":
              console.log("receive txt")
              const celltxt=panel.content.widgets.find(x => x.model.metadata.get('id')!.toString() === cellid);
              if(celltxt) {
                console.log('find cell by id !!!!!!!!!!!!!!');
                celltxt!.model.value.text = msg.content.data.txt!.toString();
              }
              break;
            case "drag_cell":
              const from=+msg.content.data.from!;
              const to=+msg.content.data.to!;
              panel.content.model?.cells.move(from,to);
              break;

            default:
              break
          }
        };
      }else{
        return null
      }
    }
}