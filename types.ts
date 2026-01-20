export interface Point {
  x: number;
  y: number;
}

export interface Keypoint {
  id: number;
  name: string;
  x: number;
  y: number;
  visible: boolean;
  locked: boolean;
  anchored?: boolean; // If true, this point is used as pivot for transforms
  color: string; // Hex color for UI
  rgb: [number, number, number]; // RGB for export
}

export interface Connection {
  p1: number; // Index of start keypoint
  p2: number; // Index of end keypoint
  color: string; // Hex
  rgb: [number, number, number];
}

export interface Size {
  width: number;
  height: number;
}

export enum ToolMode {
  SELECT = 'SELECT',
  MOVE = 'MOVE',
}

export interface PoseData {
  keypoints: Keypoint[];
}