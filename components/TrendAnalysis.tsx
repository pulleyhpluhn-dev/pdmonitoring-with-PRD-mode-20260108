
import React, { useState, useMemo, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, LineChart, Line, Brush, ScatterChart, Scatter, ZAxis, Cell
} from 'recharts';
import { ChartDataPoint, AlarmLevel } from '../types';
import { 
  Calendar, Thermometer, Zap, ChevronDown, Clock, X, Info, Settings2, Save, 
  ChevronRight, ArrowLeft, Sliders, Activity, Scale, Wifi, Timer, BarChart3, Waves,
  List, Filter, Search, Download, CheckCircle2, AlertCircle, AlertTriangle,
  RotateCcw, FileText, Plus, Trash2, Layout, Maximize2, Grid, Layers, ZapOff, Radio, BarChart, Droplets, Check, FileDown, ListFilter, Eye, HelpCircle,
  Percent, AlertOctagon
} from 'lucide-react';

interface TrendAnalysisProps {
  data?: ChartDataPoint[]; 
  isDark: boolean;
  sensorName: string;
  sensorId: string;
  sensorSn?: string;
}

type AnalysisMode = 'elec' | 'env';
type ChannelType = 'UHF' | 'TEV' | 'HFCT' | 'AE';
type TimeRange = '24h' | '7d' | '1m' | 'custom';
type ChartTab = 'PRPD' | 'PRPS' | 'PULSE' | 'CORRELATION';

interface PointDetailModalProps {
  data: ChartDataPoint | null;
  onClose: () => void;
  isDark: boolean;
}

interface SensorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
  sensorName: string;
}

interface DataListModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ChartDataPoint[];
  isDark: boolean;
  sensorName: string;
  sensorId: string;
  timeRange: TimeRange;
  onTimeRangeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  customStart: string;
  setCustomStart: (val: string) => void;
  customEnd: string;
  setCustomEnd: (val: string) => void;
  onViewDetail: (point: ChartDataPoint) => void;
}

interface TimeSelectorProps {
  timeRange: TimeRange;
  onTimeRangeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  customStart: string;
  setCustomStart: (val: string) => void;
  customEnd: string;
  setCustomEnd: (val: string) => void;
  isDark: boolean;
}

const CHANNEL_CONFIG: Record<ChannelType, { color: string, ampKey: keyof ChartDataPoint, freqKey: keyof ChartDataPoint, label: string }> = {
  UHF: { color: '#38BDF8', ampKey: 'uhf_amp', freqKey: 'uhf_freq', label: 'UHF' },    
  TEV: { color: '#C084FC', ampKey: 'tev_amp', freqKey: 'tev_freq', label: 'TEV' },    
  HFCT: { color: '#2563EB', ampKey: 'hfct_amp', freqKey: 'hfct_freq', label: 'HFCT' }, 
  AE: { color: '#EC4899', ampKey: 'ae_amp', freqKey: 'ae_freq', label: 'AE' }       
};

// --- Alarm Logic Rules ---
const ALARM_RULES = {
    UHF: {
        [AlarmLevel.CRITICAL]: { freq: 150, amp: 66.0 },
        [AlarmLevel.DANGER]: { freq: 90, amp: 55.0 },
        [AlarmLevel.WARNING]: { freq: 30, amp: 40.0 }
    },
    TEV: {
        [AlarmLevel.CRITICAL]: { freq: 150, amp: 70.0 },
        [AlarmLevel.DANGER]: { freq: 90, amp: 54.0 },
        [AlarmLevel.WARNING]: { freq: 30, amp: 40.0 }
    },
    AE: {
        [AlarmLevel.CRITICAL]: { freq: 150, amp: 50.0 },
        [AlarmLevel.DANGER]: { freq: 90, amp: 40.0 },
        [AlarmLevel.WARNING]: { freq: 30, amp: 30.0 }
    },
    HFCT: {
        [AlarmLevel.CRITICAL]: { freq: 150, amp: 60.0 },
        [AlarmLevel.DANGER]: { freq: 90, amp: 50.0 },
        [AlarmLevel.WARNING]: { freq: 30, amp: 35.0 }
    }
};

// Helper function to calculate alarm level based on channel rules
const getPointAlarmLevel = (channel: ChannelType, amp: number, freq: number): AlarmLevel => {
    const rules = ALARM_RULES[channel as keyof typeof ALARM_RULES];
    
    if (!rules) return AlarmLevel.NORMAL;

    // Check from highest severity to lowest
    if (freq > rules[AlarmLevel.CRITICAL].freq && amp > rules[AlarmLevel.CRITICAL].amp) {
        return AlarmLevel.CRITICAL;
    }
    if (freq > rules[AlarmLevel.DANGER].freq && amp > rules[AlarmLevel.DANGER].amp) {
        return AlarmLevel.DANGER;
    }
    if (freq > rules[AlarmLevel.WARNING].freq && amp > rules[AlarmLevel.WARNING].amp) {
        return AlarmLevel.WARNING;
    }

    return AlarmLevel.NORMAL;
};

// Custom Dot Component for Recharts to highlight alarm points
const CustomizedDot = (props: any) => {
    const { cx, cy, payload, channelType } = props;
    
    // Only render for valid coordinates
    if (!cx || !cy) return null;

    const config = CHANNEL_CONFIG[channelType as ChannelType];
    const amp = payload[config.ampKey] as number;
    const freq = payload[config.freqKey] as number;

    const status = getPointAlarmLevel(channelType as ChannelType, amp, freq);

    if (status === AlarmLevel.NORMAL || status === AlarmLevel.NO_DATA) {
        return null; // Don't show dot for normal points to keep chart clean
    }

    let fill = '#eab308'; // Default Warning Yellow
    let stroke = '#fff';
    let r = 4;

    if (status === AlarmLevel.DANGER) {
        fill = '#f97316'; // Orange
        r = 5;
    } else if (status === AlarmLevel.CRITICAL) {
        fill = '#ef4444'; // Red
        r = 6;
        stroke = '#fee2e2';
    }

    return (
        <circle cx={cx} cy={cy} r={r} fill={fill} stroke={stroke} strokeWidth={1} className="animate-pulse" />
    );
};

const generateData = (range: TimeRange, sensorId: string, customStart?: Date, customEnd?: Date): ChartDataPoint[] => {
  const now = new Date();
  let startTime = new Date();
  let points = 0;
  const intervalMinutes = 15;

  switch (range) {
    case '24h': startTime.setHours(now.getHours() - 24); points = (24 * 60) / intervalMinutes; break;
    case '7d': startTime.setDate(now.getDate() - 7); points = (7 * 24 * 60) / intervalMinutes; break;
    case '1m': startTime.setMonth(now.getMonth() - 1); points = (30 * 24 * 60) / intervalMinutes; break;
    case 'custom':
      if (customStart && customEnd) {
        startTime = new Date(customStart);
        const diffMs = customEnd.getTime() - customStart.getTime();
        points = Math.max(4, Math.floor(diffMs / (1000 * 60 * 15)));
      } else {
        startTime.setHours(now.getHours() - 24);
        points = 96;
      }
      break;
  }

  const data: ChartDataPoint[] = [];
  const seed = sensorId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  let uhf = 20 + (seed % 15), tev = 25 + (seed % 20), hfct = 30 + (seed % 10), ae = 8 + (seed % 5);
  let uhf_f = 40 + (seed % 30), tev_f = 80 + (seed % 50), hfct_f = 15 + (seed % 10), ae_f = 2 + (seed % 3);

  for (let i = 0; i < points; i++) {
    const time = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);
    const walk = (val: number, min: number, max: number, vol: number) => {
      let change = (Math.random() - 0.5) * vol;
      let newVal = val + change;
      return Math.max(min, Math.min(max, newVal));
    };

    uhf = walk(uhf, 15, 65, 5);
    tev = walk(tev, 20, 80, 10);
    hfct = walk(hfct, 30, 60, 4);
    ae = walk(ae, 5, 20, 2);

    uhf_f = walk(uhf_f, 20, 150, 20);
    tev_f = walk(tev_f, 50, 300, 40);
    hfct_f = walk(hfct_f, 10, 50, 10);
    ae_f = walk(ae_f, 0, 20, 3);

    const isDangerSensor = sensorId.toLowerCase().includes('s-203') || sensorId.includes('s3');
    // Increase probability of high values for danger sensors to demo alarm logic
    const spikeChance = isDangerSensor ? 0.85 : 0.98;
    const isSpike = Math.random() > spikeChance;

    if (isSpike && isDangerSensor) {
        // Force some values into alarm ranges for visual verification
        const severity = Math.random();
        if (severity > 0.7) {
            // Critical
            uhf = 68 + Math.random() * 5; uhf_f = 160 + Math.random() * 50;
            tev = 72 + Math.random() * 5; tev_f = 160 + Math.random() * 50;
            ae = 52 + Math.random() * 5; ae_f = 160 + Math.random() * 50;
        } else if (severity > 0.4) {
            // Danger
            uhf = 58 + Math.random() * 5; uhf_f = 100 + Math.random() * 40;
            tev = 56 + Math.random() * 5; tev_f = 100 + Math.random() * 40;
            ae = 42 + Math.random() * 5; ae_f = 100 + Math.random() * 40;
        } else {
            // Warning
            uhf = 42 + Math.random() * 5; uhf_f = 40 + Math.random() * 40;
            tev = 42 + Math.random() * 5; tev_f = 40 + Math.random() * 40;
            ae = 32 + Math.random() * 5; ae_f = 40 + Math.random() * 40;
        }
    }

    data.push({
      time: time.toISOString(),
      uhf_amp: uhf + (isSpike && !isDangerSensor ? Math.random() * 15 : 0),
      tev_amp: tev + (isSpike && !isDangerSensor ? Math.random() * 25 : 0),
      hfct_amp: hfct,
      ae_amp: ae,
      uhf_freq: uhf_f,
      tev_freq: tev_f + (isSpike && !isDangerSensor ? 150 : 0),
      hfct_freq: hfct_f,
      ae_freq: ae_f,
      temperature: 20 + Math.sin(i / points * Math.PI * 2) * 5 + Math.random(),
      humidity: 50 + Math.cos(i / points * Math.PI * 2) * 10 + Math.random(),
      isAlarm: isSpike 
    });
  }
  return data;
};

const generatePRPDData = (channel: ChannelType) => {
  const points = [];
  const clusters = [
    { center: 45, spread: 30, ampBase: 30 },
    { center: 225, spread: 30, ampBase: 30 }
  ];
  
  for (let i = 0; i < 600; i++) {
    const cluster = Math.random() > 0.5 ? clusters[0] : clusters[1];
    const phase = (cluster.center + (Math.random() - 0.5) * cluster.spread * 2 + 360) % 360;
    const ampMod = Math.abs(Math.sin((phase * Math.PI) / 180));
    const amp = cluster.ampBase * ampMod + Math.random() * 20 + 10;
    points.push({ x: phase, y: amp, z: Math.random() }); 
  }
  return points;
};

const generatePRPSData = (channel: ChannelType) => {
    const points = [];
    const cycles = 50; 
    for (let c = 0; c < cycles; c++) {
        const pulsesInCycle = Math.floor(Math.random() * 5) + 2; 
        for (let p = 0; p < pulsesInCycle; p++) {
            const center = Math.random() > 0.5 ? 45 : 225;
            const phase = (center + (Math.random() - 0.5) * 40 + 360) % 360;
            const amp = Math.random() * 50 + 10;
            points.push({
                phase: Math.round(phase),
                cycle: c,
                amp: amp
            });
        }
    }
    return points;
}

const generatePulseData = () => {
  const points = [];
  for (let i = 0; i < 100; i++) {
    const t = i;
    let amp = 0;
    if (i > 20) {
      const decay = Math.exp(-(i - 20) * 0.1);
      amp = 80 * decay * Math.sin((i - 20) * 0.5);
    }
    amp += (Math.random() - 0.5) * 5;
    points.push({ time: t, value: amp });
  }
  return points;
};

const generateCorrelationData = () => {
    const points = [];
    for (let i = 0; i < 100; i++) {
        points.push({ 
            index: i, 
            value: (Math.sin(i * 0.2) * 0.5 + 0.5) * (i === 37 || i === 73 ? 0.9 : Math.random() * 0.2)
        });
    }
    return points;
};

const formatDate = (isoString: string) => {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const getLevelInfo = (point: ChartDataPoint) => {
  // Check specifically against our new rules for more accuracy in detail view
  let maxStatus = AlarmLevel.NORMAL;
  
  (['UHF', 'TEV', 'AE'] as ChannelType[]).forEach(type => {
      const status = getPointAlarmLevel(type, point[CHANNEL_CONFIG[type].ampKey] as number, point[CHANNEL_CONFIG[type].freqKey] as number);
      if (status === AlarmLevel.CRITICAL) maxStatus = AlarmLevel.CRITICAL;
      else if (status === AlarmLevel.DANGER && maxStatus !== AlarmLevel.CRITICAL) maxStatus = AlarmLevel.DANGER;
      else if (status === AlarmLevel.WARNING && maxStatus === AlarmLevel.NORMAL) maxStatus = AlarmLevel.WARNING;
  });

  if (maxStatus === AlarmLevel.NORMAL) return { label: '正常', color: 'text-green-500', icon: CheckCircle2 };
  if (maxStatus === AlarmLevel.CRITICAL) return { label: '三级', color: 'text-red-500', icon: AlertCircle };
  if (maxStatus === AlarmLevel.DANGER) return { label: '二级', color: 'text-orange-500', icon: AlertTriangle };
  return { label: '一级', color: 'text-yellow-500', icon: Info };
};

const PointDetailModal: React.FC<PointDetailModalProps> = ({ data, onClose, isDark }) => {
  const [activeTab, setActiveTab] = useState<ChartTab>('PRPD');
  const [activeChannel, setActiveChannel] = useState<ChannelType>('UHF');
  
  const prpdData = useMemo(() => generatePRPDData(activeChannel), [activeChannel, data]);
  const prpsData = useMemo(() => generatePRPSData(activeChannel), [activeChannel, data]);
  const pulseData = useMemo(() => generatePulseData(), [activeChannel, data]);
  const corrData = useMemo(() => generateCorrelationData(), [activeChannel, data]);

  if (!data) return null;

  const dateStr = formatDate(data.time);
  const config = CHANNEL_CONFIG[activeChannel];
  const status = getLevelInfo(data);

  const getPRPSColor = (amp: number) => {
      if (amp < 20) return '#38BDF8'; 
      if (amp < 40) return '#22D3EE'; 
      if (amp < 60) return '#FACC15'; 
      return '#EF4444'; 
  };

  const renderChart = () => {
      switch (activeTab) {
        case 'PRPD':
            return (
                <div className="w-full h-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                            <XAxis type="number" dataKey="x" name="Phase" unit="°" domain={[0, 360]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                            <YAxis type="number" dataKey="y" name="Amp" unit="dBmV" domain={[-10, 80]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                            <ZAxis type="number" dataKey="z" range={[20, 100]} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }} />
                            <Scatter name="Discharge" data={prpdData} fill={config.color} shape="circle" />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            );
         case 'PRPS':
             return (
                 <div className="w-full h-full relative">
                     <div className="absolute top-0 right-4 z-10 text-[10px] opacity-60 flex gap-2">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-400"></div> Low</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400"></div> Med</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> High</span>
                     </div>
                     <ResponsiveContainer width="100%" height="100%">
                         <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                             <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.3} />
                             <XAxis type="number" dataKey="phase" name="Phase" unit="°" domain={[0, 360]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                             <YAxis type="number" dataKey="cycle" name="Cycle" unit="" domain={[0, 50]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} reversed />
                             <ZAxis range={[60, 60]} /> 
                             <Tooltip 
                                cursor={{ strokeDasharray: '3 3' }} 
                                contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }}
                                formatter={(value: any, name: any, props: any) => {
                                    if (name === 'Cycle') return [value, 'Cycle'];
                                    if (name === 'Phase') return [value, 'Phase'];
                                    if (props && props.payload) return [`${props.payload.amp.toFixed(1)} dBmV`, 'Amplitude'];
                                    return [value, name];
                                }}
                             />
                             <Scatter name="Pulse Sequence" data={prpsData} shape="square">
                                {prpsData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={getPRPSColor(entry.amp)} />
                                ))}
                             </Scatter>
                         </ScatterChart>
                     </ResponsiveContainer>
                 </div>
             );
         case 'PULSE':
             return (
                <div className="w-full h-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pulseData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                            <XAxis dataKey="time" type="number" domain={[0, 100]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                            <YAxis domain={[-100, 100]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }} />
                            <Line type="monotone" dataKey="value" stroke={config.color} strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
             );
         case 'CORRELATION':
              return (
                <div className="w-full h-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={corrData} margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                            <XAxis dataKey="index" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                            <YAxis domain={[-0.2, 1]} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} />
                            <Tooltip contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#fff', borderColor: isDark ? '#334155' : '#e2e8f0' }} />
                            <Line type="monotone" dataKey="value" stroke={config.color} strokeWidth={2} dot={{ r: 2 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            );
      }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn" onClick={(e) => e.target === e.currentTarget && onClose()}>
       <div className={`relative w-[95vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideInUp border ${isDark ? 'bg-[#0f172a] border-slate-700' : 'bg-white border-gray-200'}`}>
          <div className={`px-6 py-3 border-b flex justify-between items-center flex-shrink-0 ${isDark ? 'border-slate-800 bg-slate-900' : 'bg-gray-50 border-gray-100'}`}>
             <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}><Activity size={20} /></div>
                <div>
                   <h3 className={`font-bold text-lg flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      图谱详情分析 <span className={`text-xs px-2 py-0.5 rounded border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>{activeChannel} 通道</span>
                   </h3>
                   <div className="flex items-center gap-3 text-xs opacity-60 font-mono">
                      <span className="flex items-center gap-1"><Clock size={12}/> {dateStr}</span>
                   </div>
                </div>
             </div>
             <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-slate-500'}`}><X size={24} /></button>
          </div>
          <div className="flex flex-1 overflow-hidden">
             <div className={`w-20 flex flex-col items-center py-6 gap-4 border-r ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                 {(['UHF', 'TEV', 'AE', 'HFCT'] as ChannelType[]).map(type => (
                     <button key={type} onClick={() => setActiveChannel(type)} className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${activeChannel === type ? `bg-slate-800 border-2 border-[${CHANNEL_CONFIG[type].color}] shadow-lg` : 'opacity-50 hover:opacity-100'}`} style={{ borderColor: activeChannel === type ? CHANNEL_CONFIG[type].color : 'transparent' }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHANNEL_CONFIG[type].color }}></div>
                        <span className={`text-[10px] font-bold ${activeChannel === type ? 'text-white' : ''}`}>{type}</span>
                     </button>
                 ))}
             </div>
             <div className="flex-1 flex flex-col min-w-0 bg-opacity-50" style={{ backgroundColor: isDark ? '#020617' : '#ffffff' }}>
                 <div className={`flex border-b px-4 ${isDark ? 'border-slate-800' : 'border-gray-100'}`}>
                     {[
                         { id: 'PRPD', label: 'PRPD 图谱', icon: Grid },
                         { id: 'PRPS', label: 'PRPS 三维图', icon: Layers },
                         { id: 'PULSE', label: '放电脉冲', icon: Activity },
                         { id: 'CORRELATION', label: '工频相关性', icon: BarChart }
                     ].map(tab => (
                         <button key={tab.id} onClick={() => setActiveTab(tab.id as ChartTab)} className={`px-6 py-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${activeTab === tab.id ? `border-blue-500 ${isDark ? 'text-blue-400 bg-blue-500/5' : 'text-blue-600 bg-blue-50'}` : 'border-transparent opacity-50 hover:opacity-100'}`}>
                             <tab.icon size={16} />{tab.label}
                         </button>
                     ))}
                 </div>
                 <div className="flex-1 p-6 relative">
                     {renderChart()}
                 </div>
             </div>
          </div>
       </div>
    </div>
  );
};

const SensorSettingsModal: React.FC<SensorSettingsModalProps> = ({ isOpen, onClose, isDark, sensorName }) => { if(!isOpen) return null; return <div className="fixed inset-0 z-[150]" onClick={onClose}></div>; };

const TimeSelector: React.FC<TimeSelectorProps> = ({ 
    timeRange, onTimeRangeChange, showDatePicker, setShowDatePicker,
    customStart, setCustomStart, customEnd, setCustomEnd, isDark
}) => {
    return (
        <div className="flex items-center gap-2">
            <div className="relative group">
               <select 
                  className={`pl-8 pr-8 py-1.5 rounded-lg text-xs font-bold border outline-none appearance-none cursor-pointer transition-all ${isDark ? 'bg-slate-900 border-slate-600 text-slate-300 hover:border-slate-500' : 'bg-white border-gray-300 text-slate-700 hover:border-gray-400'}`}
                  value={timeRange}
                  onChange={onTimeRangeChange}
               >
                   <option value="24h">最近 24 小时</option>
                   <option value="7d">最近 7 天</option>
                   <option value="1m">最近 1 个月</option>
                   <option value="custom">自定义时间段</option>
               </select>
               <Clock size={14} className={`absolute left-2.5 top-2 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
               <ChevronDown size={12} className={`absolute right-2.5 top-2 pointer-events-none opacity-50`} />
            </div>

            {showDatePicker && (
                <div className={`flex items-center gap-2 text-xs animate-fadeIn ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={`px-2 py-1.5 rounded border outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'}`} />
                    <span>至</span>
                    <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={`px-2 py-1.5 rounded border outline-none ${isDark ? 'bg-slate-900 border-slate-600' : 'bg-white border-gray-300'}`} />
                </div>
            )}
        </div>
    )
}

const DataListModal: React.FC<DataListModalProps> = ({ 
  isOpen, onClose, data, isDark, sensorName, sensorId,
  timeRange, onTimeRangeChange, showDatePicker, setShowDatePicker,
  customStart, setCustomStart, customEnd, setCustomEnd, onViewDetail
}) => {
    const [statusFilter, setStatusFilter] = useState<AlarmLevel[]>([
      AlarmLevel.NORMAL, AlarmLevel.WARNING, AlarmLevel.DANGER, AlarmLevel.CRITICAL
    ]);
    const sn = sensorId ? `SF-UHF-${sensorId.split('-')[1] || '001'}` : 'SF-UNKNOWN';
    
    // Updated Logic: Use the rigorous getPointAlarmLevel helper
    const getPointStatus = (point: ChartDataPoint): AlarmLevel => {
        let maxLevel = AlarmLevel.NORMAL;
        // Check UHF, TEV, AE
        (['UHF', 'TEV', 'AE'] as ChannelType[]).forEach(type => {
            const level = getPointAlarmLevel(type, point[CHANNEL_CONFIG[type].ampKey] as number, point[CHANNEL_CONFIG[type].freqKey] as number);
            if (level === AlarmLevel.CRITICAL) maxLevel = AlarmLevel.CRITICAL;
            else if (level === AlarmLevel.DANGER && maxLevel !== AlarmLevel.CRITICAL) maxLevel = AlarmLevel.DANGER;
            else if (level === AlarmLevel.WARNING && maxLevel === AlarmLevel.NORMAL) maxLevel = AlarmLevel.WARNING;
        });
        return maxLevel;
    };

    const toggleStatus = (status: AlarmLevel) => {
        setStatusFilter(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
    };
    const filteredData = useMemo(() => {
        return data.filter(point => statusFilter.includes(getPointStatus(point)));
    }, [data, statusFilter]);

    const handleDownloadCSV = () => {
        const headers = ["时间戳", "名称", "SN号", "状态", "UHF幅值(dBmV)", "TEV幅值(dBmV)", "HFCT幅值(dBmV)", "AE幅值(dBmV)", "温度(°C)", "湿度(%)"];
        const rows = filteredData.map(d => [
            d.time.replace('T', ' '), sensorName, sn, getPointStatus(d), d.uhf_amp.toFixed(2), d.tev_amp.toFixed(2), d.hfct_amp.toFixed(2), d.ae_amp.toFixed(2), d.temperature.toFixed(1), d.humidity.toFixed(1)
        ]);
        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${sensorName}_data.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className={`w-full max-w-7xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slideInUp border ${isDark ? 'bg-[#0f172a] border-slate-700' : 'bg-white border-gray-200'}`}>
                {/* Header */}
                <div className={`px-6 py-4 border-b flex justify-between items-center ${isDark ? 'border-slate-800 bg-slate-800' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}><List size={20} /></div>
                        <div>
                            <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-slate-800'}`}>数据列表</h3>
                            <p className="text-xs opacity-50 flex items-center gap-2">{sensorName} <span className="px-1.5 py-0.5 rounded bg-gray-500/10 border border-gray-500/20 font-mono">{sn}</span></p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Filters */}
                         <div className={`hidden md:flex items-center gap-1 mr-2 pr-4 border-r ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                            {[
                                { level: AlarmLevel.NORMAL, label: '正常', color: '#22c55e' },
                                { level: AlarmLevel.WARNING, label: '一级', color: '#eab308' },
                                { level: AlarmLevel.DANGER, label: '二级', color: '#f97316' },
                                { level: AlarmLevel.CRITICAL, label: '三级', color: '#ef4444' }
                            ].map(opt => {
                                const isActive = statusFilter.includes(opt.level);
                                return (
                                    <button
                                        key={opt.level}
                                        onClick={() => toggleStatus(opt.level)}
                                        className={`px-2 py-1 rounded text-[10px] font-bold border transition-all flex items-center gap-1.5
                                            ${isActive 
                                                ? 'bg-opacity-10 border-opacity-30' 
                                                : 'opacity-40 hover:opacity-100 grayscale border-transparent'
                                            }
                                        `}
                                        style={{
                                            backgroundColor: isActive ? opt.color + '20' : (isDark ? '#1e293b' : '#f1f5f9'),
                                            borderColor: isActive ? opt.color : 'transparent',
                                            color: isActive ? opt.color : (isDark ? '#94a3b8' : '#64748b')
                                        }}
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.color }}></div>
                                        {opt.label}
                                    </button>
                                )
                            })}
                         </div>

                         <TimeSelector timeRange={timeRange} onTimeRangeChange={onTimeRangeChange} showDatePicker={showDatePicker} setShowDatePicker={setShowDatePicker} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} isDark={isDark} />
                        <button onClick={handleDownloadCSV} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold border transition-all ${isDark ? 'bg-green-600/20 border-green-600/50 text-green-400' : 'bg-green-50 border-green-200 text-green-600'}`}><FileDown size={14} /> 导出 CSV</button>
                        <button onClick={onClose} className={`p-2 rounded-full hover:bg-opacity-20 ${isDark ? 'hover:bg-white text-slate-400' : 'hover:bg-black text-slate-500'}`}><X size={24} /></button>
                    </div>
                </div>
                {/* Table */}
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className={`sticky top-0 z-10 ${isDark ? 'bg-slate-900 text-slate-400 shadow-md' : 'bg-gray-50 text-slate-500 border-b border-gray-200'}`}>
                            <tr>
                                <th className="px-4 py-3 whitespace-nowrap">时间戳</th>
                                <th className="px-4 py-3 whitespace-nowrap text-center">状态</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right text-blue-500">UHF 幅值</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right text-purple-500">TEV 幅值</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right text-indigo-500">HFCT 幅值</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right text-pink-500">AE 幅值</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right text-orange-500">温度 (°C)</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right text-cyan-500">湿度 (%)</th>
                                <th className="px-4 py-3 whitespace-nowrap text-center">操作</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y divide-gray-500/10 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {filteredData.map((row, i) => {
                                const status = getPointStatus(row);
                                return (
                                    <tr key={i} className={`hover:bg-black/5 transition-colors ${isDark ? 'hover:bg-white/5' : ''}`}>
                                        <td className="px-4 py-2 font-mono opacity-80">{row.time.replace('T', ' ').substring(0, 19)}</td>
                                        <td className="px-4 py-2 text-center">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${status === AlarmLevel.NORMAL ? 'bg-green-500/10 text-green-500 border-green-500/20' : status === AlarmLevel.WARNING ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : status === AlarmLevel.DANGER ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                                {status === AlarmLevel.NORMAL ? '正常' : status === AlarmLevel.WARNING ? '一级' : status === AlarmLevel.DANGER ? '二级' : '三级'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-right font-mono">{row.uhf_amp.toFixed(1)}</td>
                                        <td className="px-4 py-2 text-right font-mono">{row.tev_amp.toFixed(1)}</td>
                                        <td className="px-4 py-2 text-right font-mono">{row.hfct_amp.toFixed(1)}</td>
                                        <td className="px-4 py-2 text-right font-mono">{row.ae_amp.toFixed(1)}</td>
                                        <td className="px-4 py-2 text-right font-mono border-l border-dashed border-gray-500/10 text-orange-500/90">{row.temperature.toFixed(1)}</td>
                                        <td className="px-4 py-2 text-right font-mono text-cyan-500/90">{row.humidity.toFixed(1)}</td>
                                        <td className="px-4 py-2 text-center">
                                            <button 
                                                onClick={() => onViewDetail(row)}
                                                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center mx-auto ${isDark ? 'hover:bg-blue-500/20 text-blue-400' : 'hover:bg-blue-100 text-blue-600'}`}
                                                title="查看图谱详情"
                                            >
                                                <Eye size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

const TrendAnalysis: React.FC<TrendAnalysisProps> = ({ isDark, sensorName, sensorId, sensorSn }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDataList, setShowDataList] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<ChartDataPoint | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('elec');
  const [selectedChannels, setSelectedChannels] = useState<ChannelType[]>(['UHF', 'TEV']);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const sn = sensorSn || (sensorId ? `SF-UHF-${sensorId.split('-')[1] || '001'}` : 'SF-UNKNOWN');

  useEffect(() => {
    const dStart = customStart ? new Date(customStart) : undefined;
    const dEnd = customEnd ? new Date(customEnd) : undefined;
    setChartData(generateData(timeRange, sensorId, dStart, dEnd));
  }, [timeRange, sensorId, customStart, customEnd]);

  const handleTimeRangeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value as TimeRange;
      setTimeRange(val);
      setShowDatePicker(val === 'custom');
  };

  const toggleChannel = (channel: ChannelType) => {
      setSelectedChannels(prev => prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]);
  };

  const handleChartClick = (e: any) => {
    // Robust check for payload presence
    if (e && e.activePayload && e.activePayload.length > 0) {
        setSelectedPoint(e.activePayload[0].payload);
    }
  };

  return (
    <div className={`relative w-full h-full flex flex-col rounded-xl border transition-colors duration-300 overflow-hidden ${isDark ? 'bg-tech-card border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex justify-between items-center z-10 ${isDark ? 'bg-slate-900/30' : 'bg-gray-50/70 border-b border-gray-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}><BarChart3 size={20} /></div>
          <div>
              <h2 className={`text-base font-bold flex items-center gap-2 leading-none ${isDark ? 'text-white' : 'text-slate-800'}`}>{sensorName} - 趋势分析</h2>
              <span className={`text-[10px] font-mono opacity-50 mt-1 block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>SN: {sn}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
            <TimeSelector timeRange={timeRange} onTimeRangeChange={handleTimeRangeChange} showDatePicker={showDatePicker} setShowDatePicker={setShowDatePicker} customStart={customStart} setCustomStart={setCustomStart} customEnd={customEnd} setCustomEnd={setCustomEnd} isDark={isDark} />
            <div className={`w-px h-6 mx-1 ${isDark ? 'bg-slate-700' : 'bg-gray-300'}`}></div>
            <button onClick={() => setShowDataList(true)} className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-slate-500'}`}><List size={18} /></button>
            <button onClick={() => setShowSettings(true)} className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-200 text-slate-500'}`}><Settings2 size={18} /></button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={`px-4 py-2 border-b flex justify-between items-center gap-4 ${isDark ? 'bg-slate-800/20 border-slate-800' : 'bg-gray-50/50 border-gray-100'}`}>
          <div className={`flex p-1 rounded-lg border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'}`}>
              <button onClick={() => setAnalysisMode('elec')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${analysisMode === 'elec' ? (isDark ? 'bg-blue-600 text-white shadow' : 'bg-blue-100 text-blue-700') : 'opacity-60 hover:opacity-100'}`}><Zap size={14} /> 电磁和声学</button>
              <button onClick={() => setAnalysisMode('env')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${analysisMode === 'env' ? (isDark ? 'bg-blue-600 text-white shadow' : 'bg-blue-100 text-blue-700') : 'opacity-60 hover:opacity-100'}`}><Thermometer size={14} /> 温湿度</button>
          </div>
          {analysisMode === 'elec' && (
              <div className="flex items-center gap-2">
                  {(['UHF', 'TEV', 'HFCT', 'AE'] as ChannelType[]).map(type => {
                      const isActive = selectedChannels.includes(type);
                      const config = CHANNEL_CONFIG[type];
                      return (
                          <button key={type} onClick={() => toggleChannel(type)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold transition-all ${isActive ? `bg-opacity-20 border-opacity-50` : `opacity-50 grayscale border-transparent hover:opacity-100 hover:grayscale-0 hover:bg-white/5`}`} style={{ backgroundColor: isActive ? config.color + '20' : 'transparent', borderColor: isActive ? config.color : isDark ? '#475569' : '#cbd5e1', color: isActive ? config.color : (isDark ? '#94a3b8' : '#64748b') }}>
                              <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: config.color }}></div>{type}{isActive && <Check size={10} strokeWidth={4} />}
                          </button>
                      );
                  })}
              </div>
          )}
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 w-full min-h-0 relative p-4 flex flex-col gap-2">
         {/* Chart 1 */}
         <div className="flex-1 w-full min-h-0 relative cursor-pointer">
            <div className={`absolute top-2 left-10 z-10 text-[10px] font-bold flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{analysisMode === 'elec' ? '放电幅值 (dBmV)' : '环境温度 (°C)'}</div>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                    data={chartData} 
                    syncId="trendSync" 
                    margin={{ top: 20, right: 10, left: -20, bottom: 5 }} 
                    onClick={handleChartClick}
                >
                    <defs>
                        {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => (
                            <linearGradient key={key} id={`color${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={cfg.color} stopOpacity={0.3}/><stop offset="95%" stopColor={cfg.color} stopOpacity={0}/></linearGradient>
                        ))}
                        <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FB923C" stopOpacity={0.3}/><stop offset="95%" stopColor="#FB923C" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} vertical={false} />
                    <XAxis dataKey="time" hide />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0', borderRadius: '12px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} wrapperStyle={{ pointerEvents: 'none' }} labelFormatter={(label) => formatDate(label)} formatter={(value: number) => value.toFixed(1)} />
                    {analysisMode === 'elec' ? selectedChannels.map(ch => (
                        <Area 
                            key={ch} 
                            type="monotone" 
                            dataKey={CHANNEL_CONFIG[ch].ampKey} 
                            stroke={CHANNEL_CONFIG[ch].color} 
                            fill={`url(#color${ch})`} 
                            name={`${ch} (dBmV)`} 
                            strokeWidth={2} 
                            activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer', onClick: (_: any, e: any) => setSelectedPoint(e.payload) }} 
                            dot={<CustomizedDot channelType={ch} />}
                        />
                    )) : (
                        <Area 
                            type="monotone" 
                            dataKey="temperature" 
                            stroke="#FB923C" 
                            fill="url(#colorTemp)" 
                            name="温度 (°C)" 
                            strokeWidth={2} 
                            activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer', onClick: (_: any, e: any) => setSelectedPoint(e.payload) }} 
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
         </div>

         {/* Chart 2 */}
         <div className="flex-1 w-full min-h-0 relative cursor-pointer">
            <div className={`absolute top-2 left-10 z-10 text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{analysisMode === 'elec' ? '放电频次 (次/秒)' : '环境湿度 (%)'}</div>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                    data={chartData} 
                    syncId="trendSync" 
                    margin={{ top: 20, right: 10, left: -20, bottom: 0 }} 
                    onClick={handleChartClick}
                >
                    <defs><linearGradient id="colorHum" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3}/><stop offset="95%" stopColor="#22D3EE" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} vertical={false} />
                    <XAxis dataKey="time" tickFormatter={(tick) => { const d = new Date(tick); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }} tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#ffffff', borderColor: isDark ? '#334155' : '#e2e8f0', borderRadius: '12px', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} wrapperStyle={{ pointerEvents: 'none' }} labelFormatter={(label) => formatDate(label)} formatter={(value: number, name: string) => { if (String(name).includes('湿度')) return value.toFixed(1); return value.toFixed(0); }} />
                    {analysisMode === 'elec' ? selectedChannels.map(ch => (
                        <Area 
                            key={ch} 
                            type="monotone" 
                            dataKey={CHANNEL_CONFIG[ch].freqKey} 
                            stroke={CHANNEL_CONFIG[ch].color} 
                            fill={`url(#color${ch})`} 
                            fillOpacity={0.2} 
                            name={`${ch} (次/秒)`} 
                            strokeWidth={2} 
                            strokeDasharray="3 3" 
                            activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer', onClick: (_: any, e: any) => setSelectedPoint(e.payload) }} 
                            dot={<CustomizedDot channelType={ch} />}
                        />
                    )) : (
                        <Area 
                            type="monotone" 
                            dataKey="humidity" 
                            stroke="#22D3EE" 
                            fill="url(#colorHum)" 
                            name="湿度 (%)" 
                            strokeWidth={2} 
                            activeDot={{ r: 6, strokeWidth: 0, cursor: 'pointer', onClick: (_: any, e: any) => setSelectedPoint(e.payload) }} 
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      <SensorSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} isDark={isDark} sensorName={sensorName} />
      <DataListModal 
        isOpen={showDataList} 
        onClose={() => setShowDataList(false)} 
        data={chartData} 
        isDark={isDark} 
        sensorName={sensorName} 
        sensorId={sensorId} 
        timeRange={timeRange} 
        onTimeRangeChange={handleTimeRangeChange} 
        showDatePicker={showDatePicker} 
        setShowDatePicker={setShowDatePicker} 
        customStart={customStart} 
        setCustomStart={setCustomStart} 
        customEnd={customEnd} 
        setCustomEnd={setCustomEnd} 
        onViewDetail={(point) => setSelectedPoint(point)} 
      />
      <PointDetailModal data={selectedPoint} onClose={() => setSelectedPoint(null)} isDark={isDark} />
    </div>
  );
};

export default TrendAnalysis;