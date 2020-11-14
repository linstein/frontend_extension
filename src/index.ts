import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
} from '@jupyterlab/application';
import { NotebookStatus } from "./status"

import {
    INotebookTracker
} from '@jupyterlab/notebook';

import {CommandIDs,NotebookActions} from "./actions"
import { Session } from '@jupyterlab/services';
import {
  ToolbarButton
} from '@jupyterlab/apputils';
import {
  addIcon
} from '@jupyterlab/ui-components';

import { CodeMirrorEditor } from '@jupyterlab/codemirror'
import {Cell} from "@jupyterlab/cells"


/**
 * Initialization data for the try extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: 'try',
  autoStart: true,
  requires:[INotebookTracker],
  activate: (
    app: JupyterFrontEnd,
    notebooks: INotebookTracker,
  ): void => {
    // Create a handler for each notebook that is created.
    //新建命令覆盖原命令
    //   app.commands.addCommand(CommandIDs.insertBelow, {
    //     label: 'Insert Cell Below',
    //     execute: () => {
    //       if (current) {
    //         return NotebookActions.insertBelow(current.content,'code',notebook_status.comm);
    //       }
    //     }
    //   });
    notebooks.widgetAdded.connect((sender, panel) => {
      console.log('JupyterLab extension try is activated!');
      let notebook_status = new NotebookStatus(panel);

      //清空原toolbar下的按键，绑定新的按键以及命令
      // panel.toolbar.node.innerText='';

      const button = new ToolbarButton({
      icon: addIcon,
      onClick: () => {
        NotebookActions.insertBelow(panel.content,'code',notebook_status.comm);
      },
      tooltip: 'Insert a code cell below'
    });
      panel.toolbar.insertAfter(
      'cellType',
      app.commands.label(CommandIDs.insertBelow),
      button
    );

      //给activecell绑定事件
      let onActiveCellChanged= () =>{
      console.log("onActiveCellChanged---------------------------------------")
      const activeCell = notebooks.activeCell;
      const cellModel =  activeCell?.model;
      cellModel.value.changed.connect(_onValueChanged, panel);
      const editor = activeCell.editor as CodeMirrorEditor;
      editor.handleEvent = (event: Event,cell: Cell =activeCell) => {
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
    function focusmsg(cell: Cell){
      if(notebook_status.comm!==null){
        let cellid=''
        if(cell.model.metadata.get('id')){
          cellid=cell.model.metadata.get('id')!.toString();
        }
        const sendx={'cellid':cellid,'func':'sync','spec':'lockcell',"username":getCookie("username"),"avatar":JSON.parse(getCookie("avatar"))};
        notebook_status.comm!.send(sendx);
      }
    }
    function blurmsg(cell: Cell){
      if(notebook_status.comm!==null){
        let cellid=''
        if(cell.model.metadata.get('id')){
          cellid=cell.model.metadata.get('id')!.toString();
        }
        const sendx={'cellid':cellid,'func':'sync','spec':'unlockcell'};
        notebook_status.comm!.send(sendx);
      }
    }

    //监听cell变化并绑定txt同步信息发送
    let _onValueChanged = () => {
      if (panel.content.activeCell !== null) {
          const editor = panel.content.activeCell?.editor;
          if (editor!.hasFocus() && panel.content.activeCell!.readOnly == false) {
            const txt = editor.model!.value.text;
            let cellid:string;
            if(panel.content.activeCell.model.metadata.get('id')){
              cellid=panel.content.activeCell.model.metadata.get('id')!.toString();
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
        // const { newValue } = args;
        // void newValue.info.then(info => {
        //   if (
        //     panel.model &&
        //     panel.context.sessionContext.session?.kernel === newValue
        //   ) {
        //     panel._updateLanguage(info.language_info);
        //   }
        // });
        // void panel._updateSpec(newValue);
        if(notebook_status.comm !==null && !notebook_status.comm.isDisposed && !panel.sessionContext.session!.kernel!.isDisposed){
          notebook_status.comm!.close();
        }
        notebook_status.comm=null;
        console.log("kernel_chanege")
        notebook_status.create_comm(panel)
      });

    });
  }
};

function getCookie(cname: string): string {
    const name = cname + "=";
    const ca = document.cookie.split(';');
    let i = 0;
    for (i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}
export default extension;
