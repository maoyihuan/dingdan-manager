import { useState, useEffect } from 'react'
import './App.css'
import { defaultTemplates } from './defaultTemplates'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
function App() {
  const [templates, setTemplates] = useState([])
  const [activeTab, setActiveTab] = useState('list')
  const [importName, setImportName] = useState('')
  const [importContent, setImportContent] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [newOrder, setNewOrder] = useState('')
  const [comparedResult, setComparedResult] = useState(null)
  const [editableResult, setEditableResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [viewTemplate, setViewTemplate] = useState(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dbLoading, setDbLoading] = useState(true)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setDbLoading(true)
    const { data, error } = await supabase.from('templates').select('*').order('name')
    if (error) {
      alert('加载失败：' + error.message)
      setDbLoading(false)
      return
    }
    if (data.length === 0) {
      // 首次使用，导入默认模版
      const { error: insertError } = await supabase.from('templates').insert(
        defaultTemplates.map(t => ({ name: t.name, content: t.content }))
      )
      if (!insertError) {
        const { data: newData } = await supabase.from('templates').select('*').order('name')
        setTemplates(newData || [])
      }
    } else {
      setTemplates(data)
    }
    setDbLoading(false)
  }

  const saveTemplate = async () => {
    if (!importName.trim() || !importContent.trim()) return alert('请填写企业名称和模版内容')
    const existing = templates.find(t => t.name === importName.trim())
    if (existing) {
      const { error } = await supabase.from('templates').update({ content: importContent, updated_at: new Date() }).eq('id', existing.id)
      if (error) return alert('保存失败：' + error.message)
    } else {
      const { error } = await supabase.from('templates').insert({ name: importName.trim(), content: importContent })
      if (error) return alert('保存失败：' + error.message)
    }
    await loadTemplates()
    setImportName('')
    setImportContent('')
    alert('保存成功')
  }

  const deleteTemplate = async (id) => {
    if (!confirm('确认删除？')) return
    const { error } = await supabase.from('templates').delete().eq('id', id)
    if (error) return alert('删除失败：' + error.message)
    await loadTemplates()
  }

  const compareWithAI = async () => {
    if (!selectedTemplate || !newOrder.trim()) return alert('请选择企业并粘贴订单内容')
    setLoading(true)
    setComparedResult(null)

    const prompt = `你是一个招聘订单处理助手。我会给你一个企业的原有模版和一份新订单，请你：
1. 按照原模版的字段格式，用新订单的内容更新模版
2. 新订单中没有提到的字段保留原模版内容
3. 新订单中有的内容覆盖原模版对应字段
4. 返费/利润处理规则：
   - 有差价模式：差价归中介利润，员工无返费
   - 有返费金额：中介只留时间最短节点的200元，其余给员工写入薪资结构
   - 多个时间节点：只留第一个节点的200元给中介
5. 面试时间字段只写几点，不写日期
6. 去掉所有emoji表情符号和特殊符号（如[红包][太阳]等）
7. 输出格式：用<CHANGED>标签包裹所有有变化的内容，其余保持原样

原模版：
${selectedTemplate.content}

新订单：
${newOrder}

请直接输出更新后的完整模版，有变化的部分用<CHANGED>内容</CHANGED>包裹。`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      const result = data.content[0].text
      setComparedResult(result)
      setEditableResult(result)
    } catch (e) {
      alert('AI请求失败：' + e.message)
    }
    setLoading(false)
  }

  const confirmSave = async () => {
    if (!selectedTemplate || !editableResult.trim()) return
    const clean = editableResult.replace(/<CHANGED>/g, '').replace(/<\/CHANGED>/g, '')
    const { error } = await supabase.from('templates').update({ content: clean, updated_at: new Date() }).eq('id', selectedTemplate.id)
    if (error) return alert('保存失败：' + error.message)
    await loadTemplates()
    setComparedResult(null)
    setEditableResult('')
    setNewOrder('')
    setSelectedTemplate(null)
    alert('模版已更新保存')
    setActiveTab('list')
  }

  const renderResult = (text) => {
    const parts = text.split(/(<CHANGED>.*?<\/CHANGED>)/gs)
    return parts.map((part, i) => {
      if (part.startsWith('<CHANGED>')) {
        const content = part.replace('<CHANGED>', '').replace('</CHANGED>', '')
        return <span key={i} style={{ color: 'red', fontWeight: 'bold' }}>{content}</span>
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="app">
      <header>
        <h1>订单模版管理系统</h1>
      </header>

      <nav className="tabs">
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => setActiveTab('list')}>模版列表</button>
        <button className={activeTab === 'import' ? 'active' : ''} onClick={() => setActiveTab('import')}>导入模版</button>
        <button className={activeTab === 'compare' ? 'active' : ''} onClick={() => setActiveTab('compare')}>更新订单</button>
      </nav>

      <main>
        {activeTab === 'list' && (
          <div className="template-list">
            <h2>企业模版列表（共{templates.length}家）</h2>
            <input
              type="text"
              placeholder="搜索企业名称..."
              className="input-field"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
            />
            {dbLoading ? (
              <p className="empty">加载中...</p>
            ) : templates.length === 0 ? (
              <p className="empty">暂无模版，请先导入</p>
            ) : (
              <div className="templates">
                {templates.filter(t => t.name.includes(searchKeyword)).map(t => (
                  <div key={t.id} className="template-card">
                    <h3>{t.name}</h3>
                    <div className="card-actions">
                      <button onClick={() => setViewTemplate(t)}>查看</button>
                      <button onClick={() => {
                        setImportName(t.name)
                        setImportContent(t.content)
                        setActiveTab('import')
                      }}>编辑</button>
                      <button onClick={() => {
                        setSelectedTemplate(t)
                        setActiveTab('compare')
                      }}>更新订单</button>
                      <button className="btn-danger" onClick={() => deleteTemplate(t.id)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div className="import-section">
            <h2>导入/编辑企业模版</h2>
            <input
              type="text"
              placeholder="企业名称（如：昆山淳华）"
              className="input-field"
              value={importName}
              onChange={e => setImportName(e.target.value)}
            />
            <textarea
              placeholder="粘贴模版内容..."
              rows={25}
              className="textarea-field"
              value={importContent}
              onChange={e => setImportContent(e.target.value)}
            />
            <button className="btn-primary" onClick={saveTemplate}>保存模版</button>
          </div>
        )}

        {activeTab === 'compare' && (
          <div className="compare-section">
            <h2>更新订单</h2>
            <select
              className="select-field"
              value={selectedTemplate?.id || ''}
              onChange={e => {
                const t = templates.find(t => t.id === Number(e.target.value))
                setSelectedTemplate(t || null)
                setComparedResult(null)
                setEditableResult('')
              }}
            >
              <option value="">选择企业</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <textarea
              placeholder="粘贴最新订单内容..."
              rows={15}
              className="textarea-field"
              value={newOrder}
              onChange={e => setNewOrder(e.target.value)}
            />
            <button className="btn-primary" onClick={compareWithAI} disabled={loading}>
              {loading ? 'AI处理中...' : 'AI对比生成'}
            </button>

            {comparedResult && (
              <div className="result-section">
                <h3>对比结果（红色为修改项）</h3>
                <div className="result-preview">
                  <pre>{renderResult(comparedResult)}</pre>
                </div>
                <h3>可编辑版本</h3>
                <textarea
                  rows={25}
                  className="textarea-field"
                  value={editableResult}
                  onChange={e => setEditableResult(e.target.value)}
                />
                <div className="actions">
                  <button className="btn-secondary" onClick={() => { setComparedResult(null); setEditableResult('') }}>重新生成</button>
                  <button className="btn-primary" onClick={confirmSave}>确认保存</button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {viewTemplate && (
        <div className="modal-overlay" onClick={() => setViewTemplate(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{viewTemplate.name}</h2>
            <pre>{viewTemplate.content}</pre>
            <button onClick={() => setViewTemplate(null)}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
