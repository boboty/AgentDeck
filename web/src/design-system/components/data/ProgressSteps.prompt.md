Numbered stepper for methodology frameworks and course-module progression.

```jsx
<ProgressSteps steps={[
  { title: '场景识别', desc: '盘点高价值场景', status: 'done' },
  { title: '价值评估', desc: 'ROI 与风险矩阵', status: 'current' },
  { title: '试点验证', desc: '小步快跑', status: 'todo' },
  { title: '规模落地', desc: '沉淀工作流', status: 'todo' },
]} />
```

`orientation="vertical"` for sidebars/agendas. Steps show `done` (✓ emerald), `current` (ink, ring), or `todo` (outline).
