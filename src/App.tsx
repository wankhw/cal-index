import { useEffect, useMemo, useState } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { CandlestickChart, TreemapChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { addDays, endOfMonth, format, isToday, parseISO, startOfMonth } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { buildCandles, calculateStreak, summarizeDay, summarizeRange } from './calculations'
import { db, defaultSettings } from './db'
import type { CalorieCandle, CandlePeriod, Entry, EntryType, Settings } from './types'

echarts.use([TreemapChart, CandlestickChart, TooltipComponent, GridComponent, DataZoomComponent, CanvasRenderer])

type View = 'day' | 'trend' | 'month'
type Dialog = 'entry' | 'settings' | null

const DEMO_ENTRIES: Omit<Entry, 'id'>[] = [
  { date: format(new Date(), 'yyyy-MM-dd'), type: 'intake', name: '早餐', calories: 420, createdAt: Date.now() - 4 },
  { date: format(new Date(), 'yyyy-MM-dd'), type: 'intake', name: '午餐', calories: 680, createdAt: Date.now() - 3 },
  { date: format(new Date(), 'yyyy-MM-dd'), type: 'intake', name: '拿铁', calories: 190, createdAt: Date.now() - 2 },
  { date: format(new Date(), 'yyyy-MM-dd'), type: 'exercise', name: '快走 5km', calories: 320, createdAt: Date.now() - 1 }
]

function signed(value: number) {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))}`
}

function App() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [view, setView] = useState<View>('day')
  const [candlePeriod, setCandlePeriod] = useState<CandlePeriod>('day')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [editing, setEditing] = useState<Entry | null>(null)
  const [ready, setReady] = useState(false)

  async function refresh() {
    const [savedEntries, savedSettings] = await Promise.all([db.entries.toArray(), db.settings.get('profile')])
    setEntries(savedEntries)
    setSettings(savedSettings ?? defaultSettings)
  }

  useEffect(() => {
    async function load() {
      if (!(await db.settings.get('profile'))) await db.settings.put(defaultSettings)
      if ((await db.entries.count()) === 0) await db.entries.bulkAdd(DEMO_ENTRIES)
      await refresh()
      setReady(true)
    }
    void load()
  }, [])

  const today = format(new Date(), 'yyyy-MM-dd')
  const summary = useMemo(() => summarizeDay(selectedDate, entries, settings.bmr), [selectedDate, entries, settings.bmr])
  const dailyEntries = useMemo(() => entries.filter((entry) => entry.date === selectedDate), [entries, selectedDate])
  const streak = useMemo(
    () => calculateStreak(entries, settings.bmr, settings.deficitTarget, today),
    [entries, settings, today]
  )
  const remaining = summary.balance + settings.deficitTarget
  const good = summary.balance <= -settings.deficitTarget

  const treeData = useMemo(() => {
    const intake = dailyEntries.filter((entry) => entry.type === 'intake')
    const exercise = dailyEntries.filter((entry) => entry.type === 'exercise')
    return [
      ...intake.map((entry) => ({ ...entry, value: entry.calories, itemStyle: { color: '#e9344d' } })),
      { name: '基础代谢', calories: settings.bmr, value: settings.bmr, type: 'exercise', itemStyle: { color: '#128b59' } },
      ...exercise.map((entry) => ({ ...entry, value: entry.calories, itemStyle: { color: '#20d58d' } }))
    ]
  }, [dailyEntries, settings.bmr])

  const chartOption = {
    animationDurationUpdate: 480,
    tooltip: {
      confine: true,
      formatter: (params: { data: { name: string; calories: number; type: EntryType } }) =>
        `${params.data.name}<br/><b>${params.data.type === 'intake' ? '+' : '−'}${params.data.calories} kcal</b>`
    },
    series: [{
      type: 'treemap',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      visibleMin: 10,
      squareRatio: 1.15,
      data: treeData,
      label: {
        show: true,
        color: '#f6f7f5',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 14,
        lineHeight: 23,
        overflow: 'truncate',
        formatter: (params: { data: { name: string; calories: number; type: EntryType } }) =>
          `{name|${params.data.name}}\n${params.data.type === 'intake' ? '+' : '−'}${params.data.calories} kcal`,
        rich: { name: { fontFamily: 'system-ui, sans-serif', fontWeight: 700, fontSize: 16, lineHeight: 25 } }
      },
      upperLabel: { show: false },
      itemStyle: { borderColor: '#111719', borderWidth: 4, gapWidth: 4, borderRadius: 7 }
    }]
  }

  const monthDays = useMemo(() => {
    const date = parseISO(selectedDate)
    return summarizeRange(startOfMonth(date), endOfMonth(date), entries, settings.bmr)
  }, [selectedDate, entries, settings.bmr])

  const candleDays = useMemo(() => {
    if (!entries.length) return []
    const earliest = entries.reduce((min, entry) => entry.date < min ? entry.date : min, entries[0].date)
    return summarizeRange(parseISO(earliest), parseISO(today), entries, settings.bmr)
  }, [entries, settings.bmr, today])

  const candles = useMemo(() => buildCandles(candleDays, candlePeriod), [candleDays, candlePeriod])

  async function saveEntry(form: FormData) {
    const name = String(form.get('name') ?? '').trim()
    const calories = Number(form.get('calories'))
    const type = form.get('type') as EntryType
    if (!name || !Number.isFinite(calories) || calories <= 0) return
    if (editing?.id) {
      await db.entries.update(editing.id, { name, calories, type })
    } else {
      await db.entries.add({ date: selectedDate, name, calories, type, createdAt: Date.now() })
    }
    await refresh()
    setEditing(null)
    setDialog(null)
  }

  async function deleteEntry(id?: number) {
    if (!id) return
    await db.entries.delete(id)
    await refresh()
  }

  async function saveSettings(form: FormData) {
    const bmr = Number(form.get('bmr'))
    const deficitTarget = Number(form.get('target'))
    if (bmr < 800 || deficitTarget < 0) return
    await db.settings.put({ id: 'profile', bmr, deficitTarget })
    await refresh()
    setDialog(null)
  }

  if (!ready) return <main className="loading">正在开盘…</main>

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CAL·INDEX</p>
          <button className="date-button" onClick={() => setSelectedDate(today)}>
            {format(parseISO(selectedDate), 'yyyy年M月d日 EEEE', { locale: zhCN })}
          </button>
        </div>
        <div className="streak"><strong>ϟ {streak} 天连击</strong><span>已完成的达标日</span></div>
      </header>

      <section className={`ticker-card ${good ? 'is-good' : ''}`}>
        <div><span>当日热量余额</span><strong>{signed(summary.balance)} <small>kcal</small></strong></div>
        <div className="target"><span>目标</span><b>−{settings.deficitTarget} kcal</b><em>{good ? `超额 ${Math.abs(Math.round(remaining))} kcal` : `还差 ${Math.max(0, Math.round(remaining))} kcal`}</em></div>
      </section>

      <nav className="view-tabs" aria-label="视图切换">
        <button className={view === 'day' ? 'active' : ''} onClick={() => setView('day')}>今日大盘</button>
        <button className={view === 'trend' ? 'active' : ''} onClick={() => setView('trend')}>K线走势</button>
        <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>月度日历</button>
      </nav>

      {view === 'day' ? (
        <>
          <section className="market-card">
            <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: 410 }} notMerge />
            <div className="legend"><span><i className="red" />摄入 {summary.intake}</span><span><i className="green" />消耗 {summary.expenditure}</span><small>面积 = 热量绝对值</small></div>
          </section>
          <section className="ledger">
            <div className="section-title"><div><span>当日流水</span><small>{dailyEntries.length} 笔记录</small></div><button onClick={() => setDialog('settings')}>参数设置</button></div>
            {dailyEntries.map((entry) => (
              <article className="entry-row" key={entry.id}>
                <button className="entry-main" onClick={() => { setEditing(entry); setDialog('entry') }}>
                  <i className={entry.type} /><span>{entry.name}<small>{entry.type === 'intake' ? '摄入' : '运动消耗'}</small></span>
                  <strong>{entry.type === 'intake' ? '+' : '−'}{entry.calories}</strong>
                </button>
                <button className="delete" aria-label={`删除${entry.name}`} onClick={() => void deleteEntry(entry.id)}>×</button>
              </article>
            ))}
          </section>
        </>
      ) : view === 'trend' ? (
        <KLineView candles={candles} period={candlePeriod} onPeriodChange={setCandlePeriod} />
      ) : (
        <MonthView days={monthDays} target={settings.deficitTarget} onSelect={(date) => { setSelectedDate(date); setView('day') }} />
      )}

      <div className="date-nav">
        <button onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), -1), 'yyyy-MM-dd'))}>← 前一天</button>
        {!isToday(parseISO(selectedDate)) && <button onClick={() => setSelectedDate(today)}>回到今天</button>}
        <button disabled={selectedDate >= today} onClick={() => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}>后一天 →</button>
      </div>

      <button className="add-button" onClick={() => { setEditing(null); setDialog('entry') }} aria-label="新增记录">＋</button>

      {dialog === 'entry' && <EntryDialog entry={editing} onClose={() => { setEditing(null); setDialog(null) }} onSave={saveEntry} />}
      {dialog === 'settings' && <SettingsDialog settings={settings} onClose={() => setDialog(null)} onSave={saveSettings} />}
    </main>
  )
}

function KLineView({ candles, period, onPeriodChange }: { candles: CalorieCandle[]; period: CandlePeriod; onPeriodChange: (period: CandlePeriod) => void }) {
  const latest = candles.at(-1)
  const option = {
    animationDuration: 420,
    grid: { left: 12, right: 12, top: 24, bottom: candles.length > 10 ? 66 : 38, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'cross' },
      backgroundColor: '#172021',
      borderColor: '#344041',
      textStyle: { color: '#edf2ef' },
      formatter: (params: Array<{ axisValue: string; data: number[]; dataIndex: number }>) => {
        const candle = candles[params[0]?.dataIndex]
        if (!candle) return ''
        return `<b>${params[0].axisValue}</b><br/>开 ${signed(candle.open)}&nbsp;&nbsp;收 ${signed(candle.close)}<br/>高 ${signed(candle.high)}&nbsp;&nbsp;低 ${signed(candle.low)}<br/>周期净变化 ${signed(candle.change)} kcal`
      }
    },
    xAxis: {
      type: 'category',
      data: candles.map((candle) => candle.label),
      boundaryGap: true,
      axisLine: { lineStyle: { color: '#344041' } },
      axisTick: { show: false },
      axisLabel: { color: '#7f8a8b', fontSize: 10, hideOverlap: true }
    },
    yAxis: {
      scale: true,
      splitNumber: 4,
      axisLabel: { color: '#7f8a8b', fontSize: 10, formatter: (value: number) => `${Math.round(value)}` },
      splitLine: { lineStyle: { color: '#202829', type: 'dashed' } }
    },
    dataZoom: candles.length > 10 ? [
      { type: 'inside', startValue: Math.max(0, candles.length - 10), endValue: candles.length - 1 },
      { type: 'slider', height: 18, bottom: 12, borderColor: '#273032', backgroundColor: '#111718', fillerColor: 'rgba(32,213,141,.15)', handleStyle: { color: '#20d58d' }, textStyle: { color: '#697374' } }
    ] : [],
    series: [{
      type: 'candlestick',
      data: candles.map((candle) => [candle.open, candle.close, candle.low, candle.high]),
      barMaxWidth: 24,
      itemStyle: {
        color: '#ed3c55',
        color0: '#20d58d',
        borderColor: '#ed3c55',
        borderColor0: '#20d58d',
        borderWidth: 1.5
      }
    }]
  }

  return <section className="kline-card">
    <div className="kline-head">
      <div><span>累计热量指数</span><strong className={(latest?.change ?? 0) <= 0 ? 'positive' : 'negative'}>{latest ? signed(latest.close) : '—'} <small>kcal</small></strong></div>
      <div className="period-tabs" aria-label="K线周期">
        {([['day', '日K'], ['week', '周K'], ['month', '月K']] as const).map(([value, label]) => <button key={value} className={period === value ? 'active' : ''} onClick={() => onPeriodChange(value)}>{label}</button>)}
      </div>
    </div>
    {candles.length ? <ReactEChartsCore echarts={echarts} option={option} style={{ height: 340 }} notMerge /> : <div className="chart-empty"><strong>暂无可绘制行情</strong><span>添加至少一条热量流水后生成 K 线</span></div>}
    <div className="kline-legend"><span><i className="red" />余额上升</span><span><i className="green" />赤字扩大</span><small>{candles.length} 根K线</small></div>
    <p className="kline-note">开/收为周期首尾累计余额，高/低为周期内累计峰谷；仅统计有流水的日期。</p>
  </section>
}

function MonthView({ days, target, onSelect }: { days: ReturnType<typeof summarizeRange>; target: number; onSelect: (date: string) => void }) {
  const recordedDays = days.filter((day) => day.recorded)
  const achieved = recordedDays.filter((day) => day.balance <= -target).length
  const average = recordedDays.length ? Math.round(recordedDays.reduce((sum, day) => sum + day.balance, 0) / recordedDays.length) : 0
  return (
    <section className="month-card">
      <div className="month-kpis"><div><span>达标交易日</span><strong>{achieved}<small> / {recordedDays.length}</small></strong></div><div><span>已记录日均余额</span><strong className={average <= 0 ? 'positive' : 'negative'}>{signed(average)}<small> kcal</small></strong></div></div>
      <div className="month-grid">
        {days.map((day) => {
          const intensity = Math.min(1, Math.abs(day.balance) / 900)
          const color = !day.recorded ? '#171e1f' : day.balance <= 0 ? `rgba(32, 213, 141, ${0.15 + intensity * 0.78})` : `rgba(233, 52, 77, ${0.15 + intensity * 0.78})`
          return <button key={day.date} onClick={() => onSelect(day.date)} style={{ backgroundColor: color }}><span>{Number(day.date.slice(-2))}</span><small>{day.recorded ? signed(day.balance) : '—'}</small></button>
        })}
      </div>
      <p className="month-note">点击任意交易日查看当天流水</p>
    </section>
  )
}

function EntryDialog({ entry, onClose, onSave }: { entry: Entry | null; onClose: () => void; onSave: (form: FormData) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" action={onSave}>
    <div className="modal-head"><div><span>{entry ? '修改流水' : '新增流水'}</span><small>记下今天的一笔热量交易</small></div><button type="button" onClick={onClose}>×</button></div>
    <fieldset className="type-picker"><label><input type="radio" name="type" value="intake" defaultChecked={!entry || entry.type === 'intake'} /><span>摄入</span></label><label><input type="radio" name="type" value="exercise" defaultChecked={entry?.type === 'exercise'} /><span>运动消耗</span></label></fieldset>
    <label className="field"><span>项目名称</span><input name="name" required maxLength={18} defaultValue={entry?.name} placeholder="例如：鸡胸沙拉" autoFocus /></label>
    <label className="field"><span>热量</span><div><input name="calories" required type="number" min="1" max="9999" defaultValue={entry?.calories} placeholder="320" /><b>kcal</b></div></label>
    <button className="primary" type="submit">{entry ? '保存修改' : '确认入账'}</button>
  </form></div>
}

function SettingsDialog({ settings, onClose, onSave }: { settings: Settings; onClose: () => void; onSave: (form: FormData) => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" action={onSave}>
    <div className="modal-head"><div><span>大盘参数</span><small>仅用于记录，不构成健康建议</small></div><button type="button" onClick={onClose}>×</button></div>
    <label className="field"><span>每日基础代谢估算</span><div><input name="bmr" type="number" min="800" max="4000" defaultValue={settings.bmr} required /><b>kcal</b></div></label>
    <label className="field"><span>每日目标缺口</span><div><input name="target" type="number" min="0" max="1500" defaultValue={settings.deficitTarget} required /><b>kcal</b></div></label>
    <p className="disclaimer">基础代谢和运动消耗均为估算值。请根据专业人员建议设定适合自己的目标。</p>
    <button className="primary" type="submit">保存参数</button>
  </form></div>
}

export default App
