import React from 'react';

interface SplitDividerProps {
  onDrag: (deltaPixels: number) => void;
  onDoubleClick?: () => void;
}

export const SplitDivider: React.FC<SplitDividerProps> = ({ onDrag, onDoubleClick }) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    let lastX = e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      onDrag(delta);
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
      title="اسحب لتعديل العرض (انقر نقراً مزدوجاً للاستعادة)"
      className="w-1.5 hover:w-2 -mx-0.5 z-20 h-full flex items-center justify-center cursor-col-resize group transition-all shrink-0 select-none"
    >
      <div className="w-0.5 h-full bg-[#1e2430] group-hover:bg-sky-500 group-active:bg-sky-400 transition-colors" />
    </div>
  );
};
