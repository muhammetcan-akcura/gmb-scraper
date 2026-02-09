'use client';

import { useState, useEffect, useRef } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://gmb-scraper.onrender.com/api';

export default function Home() {
  const [activeTab, setActiveTab] = useState('sectors');
  const [districts, setDistricts] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedSectors, setSelectedSectors] = useState([]);
  const [useNeighborhoods, setUseNeighborhoods] = useState(true);
  const [neighborhoodCount, setNeighborhoodCount] = useState(0);

  const [customDistrict, setCustomDistrict] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');
  const [customName, setCustomName] = useState('');
  const [customUseNeighborhoods, setCustomUseNeighborhoods] = useState(true);

  const [currentJobId, setCurrentJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState('pending');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total: 0, withPhone: 0, cache: 0 });
  const [currentNeighborhood, setCurrentNeighborhood] = useState(null);
  const [neighborhoodProgress, setNeighborhoodProgress] = useState(null);
  const [files, setFiles] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const logContainerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const statusIntervalRef = useRef(null);

  useEffect(() => {
    loadDistricts();
    loadSectors();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (selectedDistrict) loadNeighborhoodCount(selectedDistrict);
  }, [selectedDistrict]);

  async function loadDistricts() {
    try {
      const res = await fetch(`${API_BASE}/districts`);
      const data = await res.json();
      setDistricts(data);
    } catch (error) {
      addLog('error', 'İlçeler yüklenemedi');
    }
  }

  async function loadSectors() {
    try {
      const res = await fetch(`${API_BASE}/sectors`);
      const data = await res.json();
      setSectors(data);
    } catch (error) {
      addLog('error', 'Sektörler yüklenemedi');
    }
  }

  async function loadNeighborhoodCount(district) {
    try {
      const res = await fetch(`${API_BASE}/districts/${encodeURIComponent(district)}/neighborhoods`);
      const data = await res.json();
      setNeighborhoodCount(data.length);
    } catch (error) {
      setNeighborhoodCount(0);
    }
  }

  function addLog(type, message) {
    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), type, message }]);
  }

  function toggleSector(sectorId) {
    setSelectedSectors(prev =>
      prev.includes(sectorId) ? prev.filter(id => id !== sectorId) : [...prev, sectorId]
    );
  }

  function selectAllSectors() { setSelectedSectors(sectors.map(s => s.id)); }
  function deselectAllSectors() { setSelectedSectors([]); }
  function selectHighPotential() {
    setSelectedSectors(sectors.filter(s => s.potansiyel?.includes('Çok yüksek') || s.potansiyel?.includes('Yüksek')).map(s => s.id));
  }

  function getEstimatedTime() {
    const mins = Math.ceil((selectedSectors.length * 3 * (useNeighborhoods ? (neighborhoodCount || 1) : 1) * 0.5 + selectedSectors.length * 30) / 60);
    return `~${mins || 5} dk`;
  }

  async function startSectorScrape() {
    if (!selectedDistrict) return alert('İlçe seçin');
    if (selectedSectors.length === 0) return alert('Sektör seçin');
    await startJob('/scrape', { district: selectedDistrict, sectors: selectedSectors, useNeighborhoods });
  }

  async function startCustomScrape() {
    if (!customDistrict) return alert('İlçe seçin');
    if (!customKeywords.trim()) return alert('Anahtar kelime girin');
    await startJob('/scrape/custom', { district: customDistrict, keywords: customKeywords, customName, useNeighborhoods: customUseNeighborhoods });
  }

  async function startJob(endpoint, body) {
    setIsLoading(true);
    setLogs([]);
    setProgress(0);
    setStats({ total: 0, withPhone: 0, cache: 0 });
    setFiles(null);
    setCurrentNeighborhood(null);
    setIsStopping(false);

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCurrentJobId(data.jobId);
      setJobStatus('running');
      addLog('success', 'İşlem başlatıldı!');
      startStatusPolling(data.jobId);
      startLogStreaming(data.jobId);
    } catch (error) {
      addLog('error', error.message);
      setJobStatus('error');
      setIsLoading(false);
    }
  }

  async function stopJob() {
    if (!currentJobId || isStopping) return;

    if (!confirm('İşlemi şimdi durdurup şu ana kadar çekilen verileri kaydetmek istiyor musunuz?')) {
      return;
    }

    setIsStopping(true);
    addLog('warning', 'Durdurma isteği gönderiliyor...');

    try {
      const res = await fetch(`${API_BASE}/job/${currentJobId}/stop`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        addLog('warning', 'Durdurma komutu iletildi. Mevcut veriler hazırlanıyor...');
      } else {
        throw new Error(data.error || 'Durdurma hatası');
      }
    } catch (error) {
      addLog('error', 'Durdurma hatası: ' + error.message);
      setIsStopping(false);
    }
  }

  function startStatusPolling(jobId) {
    if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    statusIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/job/${jobId}`);
        const job = await res.json();

        if (job.error) {
          addLog('error', 'Hata: ' + job.error);
          setJobStatus('error');
          clearInterval(statusIntervalRef.current);
          setIsLoading(false);
          setIsStopping(false);
          return;
        }

        setProgress(job.progress || 0);
        setStats({ total: job.totalPlaces || 0, withPhone: job.totalBusinesses || 0, cache: job.cacheHits || 0 });
        setCurrentNeighborhood(job.currentNeighborhood);
        setNeighborhoodProgress(job.neighborhoodProgress);

        if (job.status === 'completed') {
          // Status completed olsa bile files gelmemişse beklemeye devam et (Backend hazırlıyor olabilir)
          if (job.files) {
            setJobStatus('completed');
            setFiles(job.files);
            clearInterval(statusIntervalRef.current);
            setIsLoading(false);
            setIsStopping(false);
          } else {
            // Log only once for file prep if we want, or just let it poll
            if (job.progress === 100 && jobStatus !== 'completed') {
              // Hala hazırlıyor
            }
          }
        } else if (job.status === 'error') {
          setJobStatus('error');
          addLog('error', job.error || 'Bilinmeyen bir hata oluştu');
          clearInterval(statusIntervalRef.current);
          setIsLoading(false);
          setIsStopping(false);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 1000);
  }

  function startLogStreaming(jobId) {
    if (eventSourceRef.current) eventSourceRef.current.close();
    eventSourceRef.current = new EventSource(`${API_BASE}/job/${jobId}/logs?since=0`);
    eventSourceRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.logs) setLogs(prev => [...prev, ...data.logs]);
      if (data.done) eventSourceRef.current.close();
    };
    eventSourceRef.current.onerror = () => eventSourceRef.current.close();
  }

  function downloadFile(format) {
    if (currentJobId) window.open(`${API_BASE}/job/${currentJobId}/download/${format}`, '_blank');
  }

  const logColors = { info: '#60a5fa', success: '#34d399', error: '#f87171', warning: '#fbbf24', progress: '#a78bfa', neighborhood: '#22d3ee', cache: '#c084fc' };
  const statusConfig = {
    pending: { bg: '#78350f', color: '#fbbf24', text: 'Bekliyor' },
    running: { bg: '#1e3a5f', color: '#60a5fa', text: 'Çalışıyor' },
    completed: { bg: '#064e3b', color: '#34d399', text: 'Tamamlandı' },
    error: { bg: '#7f1d1d', color: '#f87171', text: 'Hata' }
  };

  const styles = {
    container: { maxWidth: '1400px', margin: '0 auto', padding: '24px', minHeight: '100vh', fontFamily: "'Inter', sans-serif" },
    header: { textAlign: 'center', marginBottom: '32px' },
    title: { fontSize: '32px', fontWeight: '700', background: 'linear-gradient(135deg, #6366f1, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    subtitle: { color: '#94a3b8', marginTop: '8px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' },
    card: { background: '#1e293b', borderRadius: '16px', padding: '24px', border: '1px solid #334155' },
    cardHeader: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #334155' },
    cardTitle: { fontSize: '18px', fontWeight: '600', flex: 1 },
    tabs: { display: 'flex', gap: '8px', marginBottom: '20px' },
    tab: (active) => ({ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${active ? '#6366f1' : '#334155'}`, background: active ? 'rgba(99, 102, 241, 0.2)' : '#0f172a', color: active ? '#fff' : '#94a3b8', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }),
    label: { display: 'block', fontSize: '14px', fontWeight: '500', color: '#94a3b8', marginBottom: '8px' },
    select: { width: '100%', padding: '12px 16px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
    toggle: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#0f172a', borderRadius: '8px', border: '1px solid #334155', marginBottom: '16px' },
    toggleBtn: (active) => ({ width: '48px', height: '26px', borderRadius: '26px', background: active ? '#10b981' : '#475569', position: 'relative', cursor: 'pointer', border: 'none' }),
    toggleDot: (active) => ({ width: '20px', height: '20px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '3px', left: active ? '25px' : '3px', transition: 'left 0.2s' }),
    infoBox: { padding: '12px 16px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '8px', fontSize: '14px', color: '#60a5fa', marginBottom: '16px' },
    btnGroup: { display: 'flex', gap: '8px', marginBottom: '12px' },
    btnSm: { padding: '6px 12px', fontSize: '12px', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer' },
    sectorGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', maxHeight: '200px', overflowY: 'auto', padding: '4px' },
    sectorItem: (selected) => ({ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: selected ? 'rgba(99, 102, 241, 0.2)' : '#0f172a', border: `1px solid ${selected ? '#6366f1' : '#334155'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }),
    stats: { display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' },
    statChip: { padding: '6px 12px', background: '#0f172a', borderRadius: '16px', fontSize: '12px', color: '#94a3b8' },
    btnPrimary: { width: '100%', padding: '14px', background: 'linear-gradient(135deg, #6366f1, #7c3aed)', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '16px', fontWeight: '600', cursor: 'pointer' },
    textarea: { width: '100%', padding: '12px 16px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px', minHeight: '80px', resize: 'vertical', outline: 'none' },
    input: { width: '100%', padding: '12px 16px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' },
    resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' },
    resultStat: { background: '#0f172a', padding: '12px', borderRadius: '8px', textAlign: 'center' },
    resultValue: { fontSize: '20px', fontWeight: '700' },
    resultLabel: { fontSize: '11px', color: '#64748b' },
    downloadBtns: { display: 'flex', gap: '8px' },
    btnDownload: { flex: 1, padding: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer' },
    statusBadge: (status) => ({ padding: '6px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: '500', background: statusConfig[status]?.bg, color: statusConfig[status]?.color }),
    progressBar: { height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' },
    progressFill: { height: '100%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', transition: 'width 0.3s' },
    currentInfo: { padding: '12px 16px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', fontSize: '14px', marginBottom: '16px' },
    logContainer: { height: '320px', overflowY: 'auto', background: '#0f172a', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '12px', border: '1px solid #334155' },
    logEntry: { padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
    footer: { marginTop: '32px', textAlign: 'center', fontSize: '13px', color: '#64748b' },
    btnStop: { width: '100%', padding: '12px', marginTop: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🗺️ GMB Veri Çekici</h1>
        </header>

      <div style={styles.grid}>
        {/* Sol Panel */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={{ fontSize: '20px' }}>⚙️</span>
            <h2 style={styles.cardTitle}>Ayarlar</h2>
          </div>

          <div style={styles.tabs}>
            <button style={styles.tab(activeTab === 'sectors')} onClick={() => setActiveTab('sectors')}>📋 Sektörler</button>
            <button style={styles.tab(activeTab === 'custom')} onClick={() => setActiveTab('custom')}>✏️ Özel Arama</button>
          </div>

          {activeTab === 'sectors' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>📍 İlçe</label>
                <select style={styles.select} value={selectedDistrict} onChange={(e) => setSelectedDistrict(e.target.value)}>
                  <option value="">İlçe seçin...</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div style={styles.toggle}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>🏘️ Mahalle Bazlı Arama</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Daha fazla sonuç için mahallelerde arar</div>
                </div>
                <button style={styles.toggleBtn(useNeighborhoods)} onClick={() => setUseNeighborhoods(!useNeighborhoods)}>
                  <div style={styles.toggleDot(useNeighborhoods)} />
                </button>
              </div>

              {selectedDistrict && (
                <div style={styles.infoBox}>
                  <strong style={{ color: '#fff' }}>{neighborhoodCount}</strong> mahallede arama yapılacak
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>🏢 Sektörler</label>
                <div style={styles.btnGroup}>
                  <button style={styles.btnSm} onClick={selectAllSectors}>Tümü</button>
                  <button style={styles.btnSm} onClick={deselectAllSectors}>Temizle</button>
                  <button style={styles.btnSm} onClick={selectHighPotential}>Yüksek Pot.</button>
                </div>
                <div style={styles.sectorGrid}>
                  {sectors.map(s => (
                    <label key={s.id} style={styles.sectorItem(selectedSectors.includes(s.id))} onClick={() => toggleSector(s.id)}>
                      <input type="checkbox" checked={selectedSectors.includes(s.id)} onChange={() => { }} style={{ accentColor: '#6366f1' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={styles.stats}>
                <span style={styles.statChip}>Seçili: <strong style={{ color: '#fff' }}>{selectedSectors.length}</strong></span>
                <span style={{ ...styles.statChip, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>{getEstimatedTime()}</span>
              </div>

              <button style={{ ...styles.btnPrimary, opacity: (isLoading || isStopping) ? 0.6 : 1 }} onClick={startSectorScrape} disabled={isLoading || isStopping}>
                {isLoading ? '⏳ Çalışıyor...' : 'Başlat'}
              </button>
            </div>
          )}

          {activeTab === 'custom' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>📍 İlçe</label>
                <select style={styles.select} value={customDistrict} onChange={(e) => setCustomDistrict(e.target.value)}>
                  <option value="">İlçe seçin...</option>
                  {districts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <div style={styles.toggle}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>🏘️ Mahalle Bazlı Arama</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Daha fazla sonuç için mahallelerde arar</div>
                </div>
                <button style={styles.toggleBtn(customUseNeighborhoods)} onClick={() => setCustomUseNeighborhoods(!customUseNeighborhoods)}>
                  <div style={styles.toggleDot(customUseNeighborhoods)} />
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>🔍 Anahtar Kelimeler (virgülle ayırın)</label>
                <textarea style={styles.textarea} value={customKeywords} onChange={(e) => setCustomKeywords(e.target.value)} placeholder="örn: berber, kuaför, güzellik salonu" />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={styles.label}>📛 Arama Adı (opsiyonel)</label>
                <input style={styles.input} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="örn: Kuaförler" />
              </div>

              <button style={{ ...styles.btnPrimary, opacity: (isLoading || isStopping) ? 0.6 : 1 }} onClick={startCustomScrape} disabled={isLoading || isStopping}>
                {isLoading ? '⏳ Çalışıyor...' : ' Özel Aramayı Başlat'}
              </button>
            </div>
          )}

          {(jobStatus === 'running' || jobStatus === 'completed') && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #334155' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>📊 Sonuçlar</h3>
              <div style={styles.resultsGrid}>
                <div style={styles.resultStat}>
                  <div style={{ ...styles.resultValue, color: '#60a5fa' }}>{stats.total}</div>
                  <div style={styles.resultLabel}>Taranan</div>
                </div>
                <div style={styles.resultStat}>
                  <div style={{ ...styles.resultValue, color: '#34d399' }}>{stats.withPhone}</div>
                  <div style={styles.resultLabel}>Telefon</div>
                </div>
                <div style={styles.resultStat}>
                  <div style={{ ...styles.resultValue, color: '#c084fc' }}>{stats.cache}</div>
                  <div style={styles.resultLabel}>Cache</div>
                </div>
                <div style={styles.resultStat}>
                  <div style={{ ...styles.resultValue, color: '#60a5fa' }}>{progress}%</div>
                  <div style={styles.resultLabel}>İlerleme</div>
                </div>
              </div>

              {jobStatus === 'running' && (
                <button
                  style={{ ...styles.btnStop, opacity: isStopping ? 0.6 : 1 }}
                  onClick={stopJob}
                  disabled={isStopping}
                >
                  {isStopping ? '🛑 Durduruluyor...' : '🛑 Durdur ve Kaydet'}
                </button>
              )}

              {jobStatus === 'completed' && files && (
                <div style={styles.downloadBtns}>
                  <button style={styles.btnDownload} onClick={() => downloadFile('xlsx')}>📊 Excel İndir</button>
                  <button style={styles.btnDownload} onClick={() => downloadFile('txt')}>📄 TXT İndir</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sağ Panel */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <span style={{ fontSize: '20px' }}>📋</span>
            <h2 style={styles.cardTitle}>İşlem Durumu</h2>
            <span style={styles.statusBadge(jobStatus)}>
              {jobStatus === 'running' && <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', marginRight: '6px', animation: 'pulse 2s infinite' }} />}
              {statusConfig[jobStatus]?.text}
            </span>
          </div>

          {currentNeighborhood && (
            <div style={styles.currentInfo}>
              <span style={{ color: '#818cf8' }}>Şu an: </span>
              <span style={{ color: '#fff', fontWeight: '500' }}>{currentNeighborhood}</span>
              {neighborhoodProgress && (
                <span style={{ marginLeft: '8px', padding: '2px 8px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', borderRadius: '4px', fontSize: '12px' }}>
                  🏘️ {neighborhoodProgress.current}/{neighborhoodProgress.total}
                </span>
              )}
            </div>
          )}

          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
            <span>{progress > 0 ? `${stats.withPhone} işletme` : 'Başlamadı'}</span>
            <span>{progress}%</span>
          </div>

          <div>
            <label style={styles.label}>📝 Canlı Log</label>
            <div ref={logContainerRef} style={styles.logContainer}>
              {logs.length === 0 ? (
                <div style={{ color: '#64748b' }}>Başlamayı bekliyor...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={styles.logEntry}>
                    <span style={{ color: '#475569', marginRight: '8px' }}>
                      [{new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}]
                    </span>
                    <span style={{ color: logColors[log.type] || '#94a3b8' }}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
