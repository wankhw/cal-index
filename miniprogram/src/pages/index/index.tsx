import { Button, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { buildCandles, dateKey, signed, summarizeDay, type CandlePeriod, type Entry, type EntryType, type Settings } from '../../core'
import './index.scss'

type ViewMode = 'market' | 'kline' | 'month'
const ENTRY_KEY = 'cal-index-entries'
const SETTINGS_KEY = 'cal-index-settings'
const defaults: Settings = { bmr: 1650, deficitTarget: 500 }

function seedEntries(): Entry[] {
  const date = dateKey()
  return [
    { id: 1, date, type: 'intake', name: '早餐', calories: 420, createdAt: 1 },
    { id: 2, date, type: 'intake', name: '午餐', calories: 680, createdAt: 2 },
    { id: 3, date, type: 'intake', name: '拿铁', calories: 190, createdAt: 3 },
    { id: 4, date, type: 'exercise', name: '快走 5km', calories: 320, createdAt: 4 }
  ]
}

export default function Index () {
  const [entries, setEntries] = useState<Entry[]>([])
  const [settings, setSettings] = useState<Settings>(defaults)
  const [view, setView] = useState<ViewMode>('market')
  const [period, setPeriod] = useState<CandlePeriod>('day')
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<EntryType>('intake')
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const today = dateKey()

  useDidShow(() => {
    const saved = Taro.getStorageSync<Entry[]>(ENTRY_KEY)
    const nextEntries = Array.isArray(saved) && saved.length ? saved : seedEntries()
    const savedSettings = Taro.getStorageSync<Settings>(SETTINGS_KEY)
    setEntries(nextEntries)
    setSettings(savedSettings?.bmr ? savedSettings : defaults)
    if (!saved?.length) Taro.setStorageSync(ENTRY_KEY, nextEntries)
  })

  const summary = useMemo(() => summarizeDay(today, entries, settings.bmr), [today, entries, settings.bmr])
  const daily = useMemo(() => entries.filter((entry) => entry.date === today), [entries, today])
  const candles = useMemo(() => buildCandles(entries, settings.bmr, period), [entries, settings.bmr, period])
  const good = summary.balance <= -settings.deficitTarget
  const remaining = summary.balance + settings.deficitTarget

  function saveEntries(next: Entry[]) { setEntries(next); Taro.setStorageSync(ENTRY_KEY, next) }
  function addEntry() {
    const value = Number(calories)
    if (!name.trim() || !Number.isFinite(value) || value <= 0) return void Taro.showToast({ title: '请填写有效名称和热量', icon: 'none' })
    saveEntries([...entries, { id: Date.now(), date: today, type: formType, name: name.trim(), calories: value, createdAt: Date.now() }])
    setName(''); setCalories(''); setShowForm(false)
  }
  function removeEntry(entry: Entry) {
    Taro.showModal({ title: '删除流水', content: `确定删除“${entry.name}”吗？` }).then((result) => {
      if (result.confirm) saveEntries(entries.filter((item) => item.id !== entry.id))
    })
  }
  function editSettings() {
    Taro.showModal({ title: '基础代谢估算', editable: true, placeholderText: String(settings.bmr) } as any).then((first: any) => {
      if (!first.confirm) return
      const bmr = Number(first.content)
      if (bmr < 800 || bmr > 4000) return void Taro.showToast({ title: '请输入 800–4000', icon: 'none' })
      Taro.showModal({ title: '每日目标缺口', editable: true, placeholderText: String(settings.deficitTarget) } as any).then((second: any) => {
        const deficitTarget = Number(second.content)
        if (!second.confirm || deficitTarget < 0 || deficitTarget > 1500) return
        const next = { bmr, deficitTarget }; setSettings(next); Taro.setStorageSync(SETTINGS_KEY, next)
      })
    })
  }

  return <ScrollView scrollY className='page'>
    <View className='header'><View><Text className='brand'>CAL·INDEX</Text><Text className='date'>{today.replace(/-/g, ' / ')}</Text></View><View className='streak'><Text>ϟ 热量账户</Text><Text className='muted'>数据仅保存在本机</Text></View></View>
    <View className={`ticker ${good ? 'good' : ''}`}><View><Text className='label'>当日热量余额</Text><Text className='balance'>{signed(summary.balance)} <Text>kcal</Text></Text></View><View className='target'><Text className='label'>目标</Text><Text>−{settings.deficitTarget} kcal</Text><Text className='badge'>{good ? `超额 ${Math.abs(remaining)}` : `还差 ${Math.max(0, remaining)}`} kcal</Text></View></View>
    <View className='tabs'>{([['market', '今日大盘'], ['kline', 'K线走势'], ['month', '月度日历']] as const).map(([key, label]) => <Button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</Button>)}</View>

    {view === 'market' && <>
      <View className='market-card'><View className='blocks'>{[...daily, { id: -1, date: today, type: 'exercise' as const, name: '基础代谢', calories: settings.bmr, createdAt: 0 }].sort((a, b) => b.calories - a.calories).map((entry) => {
        const ratio = Math.max(27, Math.min(100, entry.calories / (summary.intake + summary.expenditure) * 170))
        return <View key={entry.id} className={`block ${entry.type}`} style={{ flexBasis: `${ratio}%`, minHeight: `${Math.max(120, ratio * 2.3)}rpx` }}><Text>{entry.name}</Text><Text>{entry.type === 'intake' ? '+' : '−'}{entry.calories} kcal</Text></View>
      })}</View><View className='legend'><Text>■ 摄入 {summary.intake}</Text><Text>■ 消耗 {summary.expenditure}</Text><Text>面积≈热量</Text></View></View>
      <View className='ledger-head'><View><Text>当日流水</Text><Text className='muted'>{daily.length} 笔记录</Text></View><Button onClick={editSettings}>参数设置</Button></View>
      {daily.map((entry) => <View className='entry' key={entry.id} onLongPress={() => removeEntry(entry)}><View className={`mark ${entry.type}`} /><View className='entry-name'><Text>{entry.name}</Text><Text className='muted'>{entry.type === 'intake' ? '摄入' : '运动消耗'} · 长按删除</Text></View><Text className={entry.type}>{entry.type === 'intake' ? '+' : '−'}{entry.calories}</Text></View>)}
    </>}
    {view === 'kline' && <Kline candles={candles} period={period} setPeriod={setPeriod} />}
    {view === 'month' && <Month entries={entries} settings={settings} />}

    <Button className='add' onClick={() => setShowForm(true)}>＋</Button>
    {showForm && <View className='overlay' onClick={() => setShowForm(false)}><View className='form' onClick={(event) => event.stopPropagation()}><View className='form-head'><View><Text>新增流水</Text><Text className='muted'>记下今天的一笔热量交易</Text></View><Button onClick={() => setShowForm(false)}>×</Button></View><View className='type-tabs'><Button className={formType === 'intake' ? 'active' : ''} onClick={() => setFormType('intake')}>摄入</Button><Button className={formType === 'exercise' ? 'active' : ''} onClick={() => setFormType('exercise')}>运动消耗</Button></View><Text className='input-label'>项目名称</Text><Input value={name} onInput={(event) => setName(event.detail.value)} placeholder='例如：鸡胸沙拉' maxlength={18} /><Text className='input-label'>热量 kcal</Text><Input value={calories} onInput={(event) => setCalories(event.detail.value)} placeholder='320' type='number' /><Button className='submit' onClick={addEntry}>确认入账</Button></View></View>}
  </ScrollView>
}

function Kline({ candles, period, setPeriod }: { candles: ReturnType<typeof buildCandles>; period: CandlePeriod; setPeriod: (period: CandlePeriod) => void }) {
  const visible = candles.slice(-10); const values = visible.flatMap((item) => [item.low, item.high]); const min = Math.min(...values, 0); const max = Math.max(...values, 0); const span = Math.max(1, max - min); const y = (value: number) => (max - value) / span * 360
  return <View className='kline-card'><View className='kline-head'><View><Text className='label'>累计热量指数</Text><Text className='index-value'>{candles.length ? signed(candles[candles.length - 1].close) : '—'} kcal</Text></View><View className='periods'>{([['day', '日K'], ['week', '周K'], ['month', '月K']] as const).map(([key, label]) => <Button className={period === key ? 'active' : ''} key={key} onClick={() => setPeriod(key)}>{label}</Button>)}</View></View>{visible.length ? <View className='chart'>{visible.map((item) => { const top = y(item.high); const bottom = y(item.low); const bodyTop = y(Math.max(item.open, item.close)); const bodyBottom = y(Math.min(item.open, item.close)); const down = item.close <= item.open; return <View className='candle-col' key={item.key}><View className={`wick ${down ? 'down' : 'up'}`} style={{ top: `${top}rpx`, height: `${Math.max(2, bottom - top)}rpx` }} /><View className={`body ${down ? 'down' : 'up'}`} style={{ top: `${bodyTop}rpx`, height: `${Math.max(6, bodyBottom - bodyTop)}rpx` }} /><Text>{item.label}</Text></View> })}</View> : <View className='empty'>添加流水后生成 K 线</View>}<View className='legend'><Text>■ 余额上升</Text><Text>■ 赤字扩大</Text><Text>{candles.length} 根K线</Text></View><Text className='note'>开/收为周期首尾累计余额，高/低为周期内累计峰谷，仅统计有流水的日期。</Text></View>
}

function Month({ entries, settings }: { entries: Entry[]; settings: Settings }) {
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth(); const count = new Date(year, month + 1, 0).getDate(); const days = Array.from({ length: count }, (_, index) => summarizeDay(dateKey(new Date(year, month, index + 1)), entries, settings.bmr)); const recorded = days.filter((day) => day.recorded); const achieved = recorded.filter((day) => day.balance <= -settings.deficitTarget).length
  return <View className='month-card'><View className='month-kpis'><View><Text className='label'>达标交易日</Text><Text>{achieved} / {recorded.length}</Text></View><View><Text className='label'>已记录日均余额</Text><Text>{recorded.length ? signed(recorded.reduce((sum, day) => sum + day.balance, 0) / recorded.length) : '0'} kcal</Text></View></View><View className='calendar'>{days.map((day, index) => <View key={day.date} className={!day.recorded ? '' : day.balance <= 0 ? 'down' : 'up'}><Text>{index + 1}</Text><Text>{day.recorded ? signed(day.balance) : '—'}</Text></View>)}</View></View>
}
