Enterprise case-study card — the signature "案例卡片" used across decks, web pages and workshop handouts.

```jsx
<CaseCard
  industry="金融 · 风控"
  status="12 周 · 已交付"
  title="智能信贷审核助手"
  summary="将大模型嵌入审批工作流，沉淀可复用的评估清单。"
  metrics={[{ value: '+38%', label: '审核效率' }, { value: '4.2×', label: 'ROI' }]}
  tags={['研发提效', '工作流', '风控']}
/>
```

Composes `Badge` and `Tag`. Pass `metrics` for the KPI row and `tags` for keywords. Lifts on hover. Best sized ~360–420px wide in a grid.
