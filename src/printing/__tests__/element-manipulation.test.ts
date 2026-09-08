/**
 * Automated tests for Phase 6: Element Manipulation & Editing UX.
 */

import {
  snapToGridMm,
  moveElementInCanvas,
  resizeElementInCanvas,
  rotateElementInCanvas,
  reorderElementInCanvas,
  deleteElementInCanvas,
  CanvasHistoryManager,
  exportCanvasToTspl,
  type CanvasElement,
  type CanvasBoxElement,
  type CanvasBarcodeElement,
  type CanvasQrElement,
  type CanvasTextElement,
  type CanvasDocument,
} from '../canvas-export';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runElementManipulationTests(): void {
  console.log('--- Phase 6: Element Manipulation & Editing UX Tests ---');

  // Test 1: Snap to Grid
  assert(snapToGridMm(4.2, 0.5) === 4.0, 'snap 4.2 with 0.5 step should be 4.0');
  assert(snapToGridMm(4.3, 0.5) === 4.5, 'snap 4.3 with 0.5 step should be 4.5');
  assert(snapToGridMm(4.7, 1.0) === 5.0, 'snap 4.7 with 1.0 step should be 5.0');
  assert(snapToGridMm(4.23, 0) === 4.23, 'snap with 0 step should preserve value');
  console.log('ok snapToGridMm rounds values to physical millimeter increments');

  // Test 2: Drag Move with Clamping and Snapping
  const initialElements: CanvasElement[] = [
    {
      id: 'box-1',
      type: 'box',
      left: 10,
      top: 10,
      width: 20,
      height: 15,
    },
    {
      id: 'qr-1',
      type: 'qr',
      data: 'https://example.com',
      left: 5,
      top: 5,
      sizeMm: 12,
    },
  ];

  // Move within bounds
  const moved = moveElementInCanvas(initialElements, 'box-1', 15.3, 12.2, 50, 30);
  const movedBox = moved.find((e) => e.id === 'box-1')!;
  assert(movedBox.left === 15.3 && movedBox.top === 12.2, `Moved box should be at (15.3, 12.2)`);

  // Move with negative delta -> clamped to 0
  const clampedMin = moveElementInCanvas(initialElements, 'box-1', -10, -5, 50, 30);
  const clampedBoxMin = clampedMin.find((e) => e.id === 'box-1')!;
  assert(clampedBoxMin.left === 0 && clampedBoxMin.top === 0, `Box clamped to minimum 0,0`);

  // Move past label width (50mm) -> clamped to (50 - 20 = 30mm)
  const clampedMax = moveElementInCanvas(initialElements, 'box-1', 45, 25, 50, 30);
  const clampedBoxMax = clampedMax.find((e) => e.id === 'box-1')!;
  assert(clampedBoxMax.left === 30, `Box left clamped to 30mm (50-20), got ${clampedBoxMax.left}`);
  assert(clampedBoxMax.top === 15, `Box top clamped to 15mm (30-15), got ${clampedBoxMax.top}`);

  // Move with snap to 1.0mm
  const snappedMove = moveElementInCanvas(initialElements, 'box-1', 15.4, 8.7, 50, 30, 1.0);
  const snappedBox = snappedMove.find((e) => e.id === 'box-1')!;
  assert(snappedBox.left === 15.0, `Snapped left should be 15.0, got ${snappedBox.left}`);
  assert(snappedBox.top === 9.0, `Snapped top should be 9.0, got ${snappedBox.top}`);
  console.log('ok moveElementInCanvas updates mm model, clamps to label bounds, and supports snap');

  // Test 3: Resize Elements
  // 3a: Box resize
  const resizedBoxList = resizeElementInCanvas(initialElements, 'box-1', 'se', 5, 4, 50, 30);
  const resizedBox = resizedBoxList.find((e) => e.id === 'box-1') as CanvasBoxElement;
  assert(resizedBox.width === 25, `Box width should increase from 20 to 25, got ${resizedBox.width}`);
  assert(resizedBox.height === 19, `Box height should increase from 15 to 19, got ${resizedBox.height}`);

  // 3b: Barcode resize (height constrained, min 5mm)
  const barcodeEl: CanvasBarcodeElement = {
    id: 'bc-1',
    type: 'barcode',
    data: '12345',
    left: 5,
    top: 5,
    height: 10,
  };
  const resizedBcList = resizeElementInCanvas([barcodeEl], 'bc-1', 's', 0, -8, 50, 30);
  const resizedBc = resizedBcList[0] as CanvasBarcodeElement;
  assert(resizedBc.height === 5, `Barcode height should clamp to 5mm minimum, got ${resizedBc.height}`);

  // 3c: QR code resize (square preserved, min 8mm)
  const resizedQrList = resizeElementInCanvas(initialElements, 'qr-1', 'se', -10, -10, 50, 30);
  const resizedQr = resizedQrList.find((e) => e.id === 'qr-1') as CanvasQrElement;
  assert(resizedQr.sizeMm === 8, `QR code size should clamp to 8mm minimum, got ${resizedQr.sizeMm}`);
  console.log('ok resizeElementInCanvas enforces min/max dimensions across element types');

  // Test 4: Rotation Cycling and TSPL output
  let rotList = rotateElementInCanvas(initialElements, 'box-1');
  assert(rotList.find((e) => e.id === 'box-1')!.rotation === 90, 'rotation step 1 should be 90');
  rotList = rotateElementInCanvas(rotList, 'box-1');
  assert(rotList.find((e) => e.id === 'box-1')!.rotation === 180, 'rotation step 2 should be 180');
  rotList = rotateElementInCanvas(rotList, 'box-1');
  assert(rotList.find((e) => e.id === 'box-1')!.rotation === 270, 'rotation step 3 should be 270');
  rotList = rotateElementInCanvas(rotList, 'box-1');
  assert(rotList.find((e) => e.id === 'box-1')!.rotation === 0, 'rotation step 4 should be 0');

  // Check TSPL command generation for 90-degree rotated barcode & QR
  const rotDoc: CanvasDocument = {
    widthMm: 50,
    heightMm: 50,
    elements: [
      {
        id: 'bc-rot',
        type: 'barcode',
        data: 'ROT-123',
        left: 5,
        top: 5,
        height: 10,
        rotation: 90,
      },
      {
        id: 'qr-rot',
        type: 'qr',
        data: 'https://sez-print.local',
        left: 20,
        top: 20,
        sizeMm: 14,
        rotation: 90,
      },
    ],
  };
  const rotTspl = exportCanvasToTspl(rotDoc);
  assert(rotTspl.includes('BARCODE 60,60,"128",120,1,90,2,2,"ROT-123"'), 'Rotated barcode command verified in TSPL');
  assert(rotTspl.includes(',A,90,M2,S7,'), 'Rotated QR code command verified in TSPL');
  console.log('ok rotateElementInCanvas cycles 90-degree increments and reflects in TSPL commands');

  // Test 5: Reorder Z-ordering
  const list3: CanvasElement[] = [
    { id: 'item-A', type: 'text', text: 'A', left: 0, top: 0, fontSize: 10 },
    { id: 'item-B', type: 'text', text: 'B', left: 0, top: 0, fontSize: 10 },
    { id: 'item-C', type: 'text', text: 'C', left: 0, top: 0, fontSize: 10 },
  ];

  const toFront = reorderElementInCanvas(list3, 'item-A', 'bringToFront');
  assert(toFront[2].id === 'item-A', 'item-A should be at index 2 (front)');
  assert(toFront[0].id === 'item-B', 'item-B should be at index 0');

  const toBack = reorderElementInCanvas(list3, 'item-C', 'sendToBack');
  assert(toBack[0].id === 'item-C', 'item-C should be at index 0 (back)');

  const forward = reorderElementInCanvas(list3, 'item-A', 'moveForward');
  assert(forward[1].id === 'item-A', 'item-A should move from 0 to 1');

  const backward = reorderElementInCanvas(list3, 'item-C', 'moveBackward');
  assert(backward[1].id === 'item-C', 'item-C should move from 2 to 1');
  console.log('ok reorderElementInCanvas handles bringToFront, sendToBack, moveForward, moveBackward');

  // Test 6: Delete Element
  const deleted = deleteElementInCanvas(list3, 'item-B');
  assert(deleted.length === 2, 'List length should be 2 after delete');
  assert(!deleted.some((e) => e.id === 'item-B'), 'item-B should be removed');
  console.log('ok deleteElementInCanvas cleanly removes elements');

  // Test 7: Undo / Redo CanvasHistoryManager
  const history = new CanvasHistoryManager<CanvasElement[]>(list3);
  assert(!history.canUndo(), 'Initially cannot undo');
  assert(!history.canRedo(), 'Initially cannot redo');

  // Push state 1 (moved item-A)
  const state1 = moveElementInCanvas(list3, 'item-A', 5, 5, 50, 30);
  history.push(state1);
  assert(history.canUndo(), 'Can undo after 1 push');
  assert(!history.canRedo(), 'Cannot redo before undo');

  // Push state 2 (moved item-A again)
  const state2 = moveElementInCanvas(state1, 'item-A', 15, 15, 50, 30);
  history.push(state2);
  assert(history.getCurrent().find((e) => e.id === 'item-A')!.left === 15, 'Current left is 15');

  // Undo back to state 1
  const undo1 = history.undo();
  assert(undo1 !== null, 'Undo 1 should succeed');
  assert(undo1!.find((e) => e.id === 'item-A')!.left === 5, 'Undo 1 restored left=5');
  assert(history.canRedo(), 'Can redo after undo');

  // Undo back to initial state
  const undo2 = history.undo();
  assert(undo2 !== null, 'Undo 2 should succeed');
  assert(undo2!.find((e) => e.id === 'item-A')!.left === 0, 'Undo 2 restored left=0');
  assert(!history.canUndo(), 'Cannot undo past initial state');

  // Redo back to state 1
  const redo1 = history.redo();
  assert(redo1 !== null, 'Redo 1 should succeed');
  assert(redo1!.find((e) => e.id === 'item-A')!.left === 5, 'Redo 1 restored left=5');

  // Push new action after undo clears future
  const state3 = moveElementInCanvas(redo1!, 'item-A', 22, 22, 50, 30);
  history.push(state3);
  assert(!history.canRedo(), 'Pushing new action clears redo future');
  assert(history.getCurrent().find((e) => e.id === 'item-A')!.left === 22, 'Current left is 22');
  console.log('ok CanvasHistoryManager accurately handles multi-step undo, redo, and state branching');

  console.log('ALL PHASE 6 ELEMENT MANIPULATION TESTS PASSED');
}
