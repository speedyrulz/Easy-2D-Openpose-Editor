import React, { useState, useRef } from 'react';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { Keypoint } from '../types';
import { LIMB_PAIRS, KEYPOINT_NAMES } from '../constants';
import { 
  Download, 
  Upload, 
  Trash2, 
  Eye, 
  EyeOff, 
  RefreshCw,
  Wand2,
  Unlock,
  Lock,
  FileJson,
  Undo,
  Redo,
  Maximize,
  RotateCw,
  MoveHorizontal,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  FileUp,
  Image as ImageIcon,
  AlertOctagon,
  MousePointer2,
  Move,
  Magnet
} from 'lucide-react';

interface SidebarProps {
  keypoints: Keypoint[];
  onToggleVisibility: (id: number) => void;
  onReset: () => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  isProcessing: boolean;
  onAutoDetect: () => void;
  hasImage: boolean;
  canvasSize: { width: number, height: number };
  onSizeChange: (w: number, h: number) => void;
  constraints: Record<string, number>;
  onToggleConstraint: (p1: number, p2: number) => void;
  lockCanvas: boolean;
  onToggleLockCanvas: () => void;
  keepPose: boolean;
  onToggleKeepPose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onScaleStart: () => void;
  onScale: (factor: number) => void;
  onToggleLock: (id: number) => void;
  onTransformStart: () => void;
  onTransform: (rotateZ: number, widthScale: number) => void;
  onTransformEnd: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  bgOpacity: number;
  onBgOpacityChange: (val: number) => void;
  onToggleAllLock: () => void;
  onToggleAllVisibility: () => void;
  onFactoryReset: () => void;
  editorMode: 'pose' | 'background';
  onSetEditorMode: (mode: 'pose' | 'background') => void;
  limbThickness: number;
  onLimbThicknessChange: (val: number) => void;
  snapToEdges: boolean;
  onToggleSnapToEdges: () => void;
  onExportBackground: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  keypoints,
  onToggleVisibility,
  onReset,
  onImageUpload,
  onExportPng,
  onExportJson,
  onImportJson,
  onClearImage,
  isProcessing,
  onAutoDetect,
  hasImage,
  canvasSize,
  onSizeChange,
  constraints,
  onToggleConstraint,
  lockCanvas,
  onToggleLockCanvas,
  keepPose,
  onToggleKeepPose,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onScaleStart,
  onScale,
  onToggleLock,
  onTransformStart,
  onTransform,
  onTransformEnd,
  onFlipHorizontal,
  onFlipVertical,
  bgOpacity,
  onBgOpacityChange,
  onToggleAllLock,
  onToggleAllVisibility,
  onFactoryReset,
  editorMode,
  onSetEditorMode,
  limbThickness,
  onLimbThicknessChange,
  snapToEdges,
  onToggleSnapToEdges,
  onExportBackground
}) => {
  const [scaleValue, setScaleValue] = useState(1);
  const [spinValue, setSpinValue] = useState(0);
  const [widthValue, setWidthValue] = useState(100);

  // Refs to track values at start of drag
  const startScaleRef = useRef(1);
  const startSpinRef = useRef(0);
  const startWidthRef = useRef(100);

  // Scale Handlers
  const handleScaleStart = () => {
    startScaleRef.current = scaleValue;
    onScaleStart();
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScaleValue(val);
    const start = startScaleRef.current || 1;
    onScale(val / start);
  };

  const handleScalePointerUp = () => {
    setScaleValue(1);
  };

  // Transform Handlers
  const handleTransformStart = (type: 'spin' | 'width') => {
    if (type === 'spin') startSpinRef.current = spinValue;
    if (type === 'width') startWidthRef.current = widthValue;
    onTransformStart();
  };

  const handleSpinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSpinValue(val);
    const delta = val - startSpinRef.current;
    onTransform(delta, 1); // width factor 1 means no change
  };

  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setWidthValue(val);
    const start = startWidthRef.current || 100;
    const factor = val / start;
    onTransform(0, factor); // spin delta 0 means no change
  };

  const handleTransformEnd = () => {
    onTransformEnd();
  };

  const resetSliders = () => {
    setSpinValue(0);
    setWidthValue(100);
    setScaleValue(1);
  };

  const allLocked = keypoints.every(k => k.locked);
  const allVisible = keypoints.every(k => k.visible);

  return (
    <div className="w-80 bg-zinc-900 border-l border-zinc-800 flex flex-col h-full z-20 shadow-xl">
      <div className="p-4 border-b border-zinc-800 bg-zinc-900">
        <h2 className="text-xl font-bold text-white mb-1">OpenPose Editor</h2>
        <p className="text-xs text-zinc-400">ControlNet skeleton generator</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Tool Mode Toggle */}
        <div className="space-y-2">
            <div className="bg-zinc-800 p-1 rounded-lg flex gap-1">
                <button 
                    onClick={() => onSetEditorMode('pose')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${editorMode === 'pose' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
                >
                    <MousePointer2 size={14} /> Edit Pose
                </button>
                <button 
                    onClick={() => onSetEditorMode('background')}
                    className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all ${editorMode === 'background' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}`}
                    disabled={!hasImage}
                    title={!hasImage ? "Upload an image first" : "Move & Zoom Background"}
                >
                    <Move size={14} /> Move BG
                </button>
            </div>
            
            {editorMode === 'background' && hasImage && (
                <div className="flex items-center gap-2 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input 
                        type="checkbox" 
                        id="snapToEdges"
                        checked={snapToEdges}
                        onChange={onToggleSnapToEdges}
                        className="rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500/50"
                    />
                    <label htmlFor="snapToEdges" className="text-xs text-zinc-400 cursor-pointer select-none flex items-center gap-1">
                        <Magnet size={12} className={snapToEdges ? "text-blue-400" : "text-zinc-600"}/> Stick to Edges
                    </label>
                </div>
            )}
        </div>

        {/* Canvas Settings */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
             <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Canvas</h3>
             <button 
                onClick={onToggleLockCanvas}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${lockCanvas ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                title={lockCanvas ? "Unlock size" : "Lock size to prevent changes on upload"}
             >
                {lockCanvas ? <Lock size={12} /> : <Unlock size={12} />}
                <span>{lockCanvas ? 'Locked' : 'Unlocked'}</span>
             </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
             <div>
               <label className="text-xs text-zinc-400 mb-1 block">Width</label>
               <input 
                  type="number" 
                  value={canvasSize.width}
                  disabled={lockCanvas}
                  onChange={(e) => onSizeChange(parseInt(e.target.value) || 512, canvasSize.height)}
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${lockCanvas ? 'opacity-50 cursor-not-allowed' : ''}`}
               />
             </div>
             <div>
               <label className="text-xs text-zinc-400 mb-1 block">Height</label>
               <input 
                  type="number" 
                  value={canvasSize.height}
                  disabled={lockCanvas}
                  onChange={(e) => onSizeChange(canvasSize.width, parseInt(e.target.value) || 512)}
                  className={`w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${lockCanvas ? 'opacity-50 cursor-not-allowed' : ''}`}
               />
             </div>
          </div>
        </div>

        {/* Appearance */}
        <div className="space-y-3">
             <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Appearance</h3>
             <div>
               <label className="text-xs text-zinc-400 mb-1 flex justify-between">
                 <span>Limb Thickness</span>
                 <span>{limbThickness}px</span>
               </label>
               <input 
                  type="range" 
                  min="1" 
                  max="30" 
                  value={limbThickness}
                  onChange={(e) => onLimbThicknessChange(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-zinc-400"
               />
             </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Actions</h3>
          
          <div className="flex gap-2 mb-2">
            <Tooltip content="Undo (Ctrl+Z)" className="flex-1">
              <Button 
                onClick={onUndo} 
                variant="secondary" 
                size="sm" 
                className="w-full"
                disabled={!canUndo}
                icon={<Undo size={14}/>}
              >
                Undo
              </Button>
            </Tooltip>
            
            <Tooltip content="Redo (Ctrl+Y)" className="flex-1">
              <Button 
                onClick={onRedo} 
                variant="secondary" 
                size="sm" 
                className="w-full"
                disabled={!canRedo}
                icon={<Redo size={14}/>}
              >
                Redo
              </Button>
            </Tooltip>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onExportPng} variant="primary" size="sm" icon={<Download size={14}/>}>
              Save PNG
            </Button>
            <Button onClick={onExportBackground} variant="secondary" size="sm" icon={<ImageIcon size={14}/>}>
              Save BG
            </Button>
          </div>

          <Button onClick={onExportJson} variant="primary" size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500" icon={<FileJson size={14}/>}>
              Save JSON
          </Button>

          <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={onImportJson}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <Button variant="secondary" size="sm" className="w-full" icon={<FileUp size={14}/>}>
                  Load JSON
                </Button>
          </div>
          
          <Button 
            onClick={() => {
              resetSliders();
              onReset();
            }} 
            variant="secondary" 
            size="sm" 
            className="w-full" 
            icon={<RefreshCw size={14}/>}
          >
            Reset Pose
          </Button>
          
          <Button 
            onClick={() => {
                resetSliders();
                onFactoryReset();
            }} 
            variant="danger" 
            size="sm" 
            className="w-full bg-red-900/50 hover:bg-red-800 border border-red-800 text-red-200" 
            icon={<AlertOctagon size={14}/>}
          >
            Reset All
          </Button>

          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-2 px-1">
                <input 
                    type="checkbox" 
                    id="keepPose"
                    checked={keepPose}
                    onChange={onToggleKeepPose}
                    className="rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500/50"
                />
                <label htmlFor="keepPose" className="text-xs text-zinc-400 cursor-pointer select-none">
                    Keep pose on upload
                </label>
            </div>

            <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={onImageUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <Button variant="secondary" className="w-full" icon={<Upload size={14}/>}>
                  Upload Background
                </Button>
            </div>
            
            {hasImage && (
              <div className="bg-zinc-800/50 p-2 rounded-lg border border-zinc-700/50 space-y-2">
                 <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span className="flex items-center gap-1"><ImageIcon size={12}/> Opacity</span>
                    <span>{Math.round(bgOpacity * 100)}%</span>
                 </div>
                 <input 
                    type="range" 
                    min="0" max="1" step="0.05" 
                    value={bgOpacity} 
                    onChange={(e) => onBgOpacityChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                 />
                 <Button onClick={onClearImage} variant="danger" size="sm" className="w-full mt-1" icon={<Trash2 size={14}/>}>
                   Remove Background
                 </Button>
              </div>
            )}
          </div>

          {hasImage && (
            <Button 
              onClick={onAutoDetect} 
              variant="primary" 
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 border-none" 
              icon={<Wand2 size={14}/>}
              disabled={isProcessing}
            >
              {isProcessing ? 'Detecting...' : 'Detect Pose (AI)'}
            </Button>
          )}
        </div>

        {/* Pose Transform */}
        <div className="space-y-3">
           <div className="flex justify-between items-center">
             <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Pose Transform</h3>
             {(spinValue !== 0 || widthValue !== 100) && (
               <button 
                onClick={resetSliders}
                className="text-xs bg-zinc-800 hover:bg-zinc-700 text-blue-400 border border-zinc-700 hover:border-zinc-600 px-2.5 py-1 rounded shadow-sm transition-all flex items-center gap-1.5"
               >
                 <RotateCcw size={10} /> Reset Dials
               </button>
             )}
           </div>
           
           <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50 space-y-4">
             {/* Flip Buttons */}
             <div className="flex gap-2">
                <Button 
                    onClick={onFlipHorizontal} 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 text-xs" 
                    icon={<FlipHorizontal size={14}/>}
                >
                    Flip X
                </Button>
                <Button 
                    onClick={onFlipVertical} 
                    variant="secondary" 
                    size="sm" 
                    className="flex-1 text-xs" 
                    icon={<FlipVertical size={14}/>}
                >
                    Flip Y
                </Button>
             </div>

             {/* Scale */}
             <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1"><Maximize size={12}/> Scale</span>
                  <span>{Math.round(scaleValue * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.01" 
                  value={scaleValue}
                  onPointerDown={handleScaleStart}
                  onChange={handleScaleChange}
                  onPointerUp={handleScalePointerUp}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
             </div>

             {/* Spin (Z-Axis) */}
             <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1"><RotateCw size={12}/> Spin (2D)</span>
                  <span>{Math.round(spinValue)}°</span>
                </div>
                <input 
                  type="range" 
                  min="-180" 
                  max="180" 
                  step="1" 
                  value={spinValue}
                  onPointerDown={() => handleTransformStart('spin')}
                  onChange={handleSpinChange}
                  onPointerUp={handleTransformEnd}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
             </div>

             {/* Width (Perspective) */}
             <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1"><MoveHorizontal size={12}/> Perspective Width</span>
                  <span>{Math.round(widthValue)}%</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="200" 
                  step="1" 
                  value={widthValue}
                  onPointerDown={() => handleTransformStart('width')}
                  onChange={handleWidthChange}
                  onPointerUp={handleTransformEnd}
                  className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
             </div>
           </div>
        </div>

        {/* Limb Constraints */}
        <div className="space-y-3">
           <div className="flex justify-between items-center">
             <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Lock Distances</h3>
           </div>
           
           <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
             {LIMB_PAIRS.map(([p1, p2], idx) => {
               const key = [p1, p2].sort((a, b) => a - b).join('-');
               const isLocked = !!constraints[key];
               return (
                 <div key={key} className="flex items-center justify-between p-2 rounded hover:bg-zinc-800 group transition-colors">
                   <span className="text-xs text-zinc-400">
                     {KEYPOINT_NAMES[p1]} <span className="text-zinc-600 mx-1">-</span> {KEYPOINT_NAMES[p2]}
                   </span>
                   <button 
                    onClick={() => onToggleConstraint(p1, p2)}
                    className={`text-zinc-500 hover:text-white transition-colors ${isLocked ? 'text-blue-400 opacity-100' : 'opacity-40 group-hover:opacity-100'}`}
                    title={isLocked ? "Unlock distance" : "Lock distance"}
                   >
                     {isLocked ? <Lock size={14}/> : <Unlock size={14}/>}
                   </button>
                 </div>
               );
             })}
           </div>
        </div>

        {/* Keypoints List */}
        <div className="space-y-3">
           <div className="flex justify-between items-center">
             <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Keypoints</h3>
             <div className="flex gap-1">
                 <button 
                    onClick={onToggleAllLock} 
                    className={`p-1 rounded hover:bg-zinc-800 transition-colors ${allLocked ? 'text-red-500' : 'text-zinc-500'}`}
                    title={allLocked ? "Unlock All" : "Lock All"}
                 >
                    {allLocked ? <Lock size={12}/> : <Unlock size={12}/>}
                 </button>
                 <button 
                    onClick={onToggleAllVisibility} 
                    className={`p-1 rounded hover:bg-zinc-800 transition-colors ${allVisible ? 'text-zinc-300' : 'text-zinc-500'}`}
                    title={allVisible ? "Hide All" : "Show All"}
                 >
                    {allVisible ? <Eye size={12}/> : <EyeOff size={12}/>}
                 </button>
             </div>
           </div>
           
           <div className="space-y-1">
             {keypoints.map((kp) => (
               <div key={kp.id} className={`flex items-center justify-between p-2 rounded hover:bg-zinc-800 group ${!kp.visible ? 'bg-zinc-900/30' : ''}`}>
                 <div className={`flex items-center gap-2 ${!kp.visible ? 'opacity-50' : ''}`}>
                   <div className="w-3 h-3 rounded-full" style={{ backgroundColor: kp.visible ? kp.color : '#52525b' }}></div>
                   <span className={`text-sm ${!kp.visible ? 'text-zinc-500' : 'text-zinc-300'}`}>{kp.name}</span>
                 </div>
                 
                 <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                    onClick={() => onToggleLock(kp.id)}
                    className={`transition-colors ${
                      kp.locked 
                        ? 'opacity-100 text-red-500 hover:text-red-400' 
                        : 'text-zinc-500 hover:text-white'
                    }`}
                    title={kp.locked ? "Unlock joint" : "Lock joint"}
                   >
                     {kp.locked ? <Lock size={14}/> : <Unlock size={14}/>}
                   </button>

                   <button 
                    onClick={() => onToggleVisibility(kp.id)}
                    className={`transition-colors ${
                      !kp.visible 
                        ? 'opacity-100 text-zinc-600 hover:text-zinc-400' 
                        : 'text-zinc-500 hover:text-white'
                    }`}
                    title={kp.visible ? "Hide joint" : "Show joint"}
                   >
                     {kp.visible ? <Eye size={14}/> : <EyeOff size={14}/>}
                   </button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
};