import {
  ICodeCellModel,
  IMarkdownCellModel,
  CodeCellModel,
  MarkdownCellModel,
  CellModel,
    ICellModel,
  Cell
} from '@jupyterlab/cells';

import * as nbformat from '@jupyterlab/nbformat';

import { Kernel } from '@jupyterlab/services';

import { UUID } from '@lumino/coreutils';

import { ElementExt } from '@lumino/domutils';


import {
    Notebook
} from '@jupyterlab/notebook';

export namespace CommandIDs {
    export const insertBelow = 'notebook:insert-cell-below-new';
}

export namespace NotebookActions {
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
            {'id': id}
        );
        console.log(cell.metadata);
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

export function createCell(type: nbformat.CellType, opts: CellModel.IOptions): ICellModel {
      switch (type) {
        case 'code':
          return createCodeCell(opts);
        case 'markdown':
          return createMarkdownCell(opts);
      }
    }


export function createCodeCell(options: CodeCellModel.IOptions): ICodeCellModel {
    // options.modelDB = this.modelDB.view(options.id);
    return new CodeCellModel(options);
}

export function createMarkdownCell(options: CellModel.IOptions): IMarkdownCellModel {

      return new MarkdownCellModel(options);
}