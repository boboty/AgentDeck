Underline tab bar for switching between content views (course modules, case filters, etc.).

```jsx
<Tabs
  defaultValue="all"
  onChange={(id) => setView(id)}
  items={[
    { id: 'all', label: '全部案例', badge: 24 },
    { id: 'fin', label: '金融' },
    { id: 'mfg', label: '制造' },
  ]}
/>
```

Works controlled (`value` + `onChange`) or uncontrolled (`defaultValue`). Optional `badge` adds a count chip.
