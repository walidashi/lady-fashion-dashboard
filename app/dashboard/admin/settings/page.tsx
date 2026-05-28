'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Profile, ShippingCompany } from '@/lib/types'
import {
  createEmployee, updateUserRole, deleteUser,
  addShippingCompany, deleteShippingCompany,
} from '@/app/actions/settings'
import { UserPlus, Trash2, Truck, Plus, Shield, User, RefreshCw } from 'lucide-react'

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), [])

  const [users, setUsers] = useState<Profile[]>([])
  const [companies, setCompanies] = useState<ShippingCompany[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [activeTab, setActiveTab] = useState<'users' | 'shipping'>('users')

  // New user form
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'employee' as 'employee' | 'admin' })
  const [userError, setUserError] = useState('')
  const [userSuccess, setUserSuccess] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  // New company form
  const [newCompany, setNewCompany] = useState('')
  const [companyError, setCompanyError] = useState('')
  const [companyLoading, setCompanyLoading] = useState(false)

  const fetchUsers = async () => {
    setLoadingUsers(true)
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setUsers((data ?? []) as Profile[])
    setLoadingUsers(false)
  }

  const fetchCompanies = async () => {
    setLoadingCompanies(true)
    const { data } = await supabase.from('shipping_companies').select('*').order('name')
    setCompanies((data ?? []) as ShippingCompany[])
    setLoadingCompanies(false)
  }

  useEffect(() => { fetchUsers(); fetchCompanies() }, [])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserError(''); setUserSuccess(''); setUserLoading(true)
    const result = await createEmployee(newUser)
    if (result.error) {
      setUserError(result.error)
    } else {
      setUserSuccess(`تم إنشاء الحساب بنجاح`)
      setNewUser({ full_name: '', email: '', password: '', role: 'employee' })
      fetchUsers()
    }
    setUserLoading(false)
  }

  const handleRoleChange = async (userId: string, role: 'employee' | 'admin') => {
    await updateUserRole(userId, role)
    fetchUsers()
  }

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`حذف المستخدم "${name}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return
    const result = await deleteUser(userId)
    if (result.error) alert(result.error)
    else fetchUsers()
  }

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setCompanyError(''); setCompanyLoading(true)
    const result = await addShippingCompany(newCompany.trim())
    if (result.error) setCompanyError(result.error)
    else { setNewCompany(''); fetchCompanies() }
    setCompanyLoading(false)
  }

  const handleDeleteCompany = async (id: string, name: string) => {
    if (!confirm(`حذف شركة "${name}"؟`)) return
    const result = await deleteShippingCompany(id)
    if (result.error) alert(result.error)
    else fetchCompanies()
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">الإعدادات</h1>
        <p className="text-sm text-gray-500 mt-0.5">إدارة المستخدمين وشركات الشحن</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'users' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          المستخدمون
        </button>
        <button
          onClick={() => setActiveTab('shipping')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'shipping' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4" />
          شركات الشحن
        </button>
      </div>

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <div className="space-y-5">
          {/* Add user form */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-pink-500" />
              إضافة مستخدم جديد
            </h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">الاسم الكامل <span className="text-red-500">*</span></label>
                  <input
                    className="input-field"
                    placeholder="اسم الموظف"
                    value={newUser.full_name}
                    onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">الصلاحية</label>
                  <select
                    className="input-field"
                    value={newUser.role}
                    onChange={e => setNewUser(p => ({ ...p, role: e.target.value as 'employee' | 'admin' }))}
                  >
                    <option value="employee">موظف</option>
                    <option value="admin">أدمن</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">البريد الإلكتروني <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="email@example.com"
                  dir="ltr"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">كلمة المرور <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="6 أحرف على الأقل"
                  dir="ltr"
                  value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  minLength={6}
                  required
                />
              </div>
              {userError && <p className="error-text">{userError}</p>}
              {userSuccess && <p className="text-green-600 text-sm">{userSuccess}</p>}
              <button type="submit" disabled={userLoading} className="btn-primary flex items-center gap-2 disabled:opacity-60">
                <Plus className="w-4 h-4" />
                {userLoading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
              </button>
            </form>
          </div>

          {/* Users list */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-800">المستخدمون الحاليون</h2>
              <button onClick={fetchUsers} className="text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loadingUsers ? (
              <div className="p-8 text-center text-gray-400 text-sm">جاري التحميل...</div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">لا يوجد مستخدمون</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {users.map(user => (
                  <li key={user.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-pink-600 font-semibold text-sm">{user.full_name?.[0] ?? '؟'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{user.full_name}</p>
                      <p className="text-xs text-gray-400">{user.id.slice(0, 8)}...</p>
                    </div>
                    {/* Role selector */}
                    <select
                      value={user.role}
                      onChange={e => handleRoleChange(user.id, e.target.value as 'employee' | 'admin')}
                      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                        user.role === 'admin'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      <option value="employee">موظف</option>
                      <option value="admin">أدمن</option>
                    </select>
                    <button
                      onClick={() => handleDeleteUser(user.id, user.full_name)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="حذف المستخدم"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Shipping Tab ── */}
      {activeTab === 'shipping' && (
        <div className="space-y-5">
          {/* Add company form */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-pink-500" />
              إضافة شركة شحن
            </h2>
            <form onSubmit={handleAddCompany} className="flex gap-3">
              <input
                className="input-field flex-1"
                placeholder="اسم الشركة"
                value={newCompany}
                onChange={e => setNewCompany(e.target.value)}
                required
              />
              <button type="submit" disabled={companyLoading || !newCompany.trim()} className="btn-primary disabled:opacity-60 whitespace-nowrap">
                {companyLoading ? '...' : 'إضافة'}
              </button>
            </form>
            {companyError && <p className="error-text mt-2">{companyError}</p>}
          </div>

          {/* Companies list */}
          <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-800">شركات الشحن</h2>
              <button onClick={fetchCompanies} className="text-gray-400 hover:text-gray-600 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {loadingCompanies ? (
              <div className="p-8 text-center text-gray-400 text-sm">جاري التحميل...</div>
            ) : companies.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">لا توجد شركات شحن</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {companies.map(company => (
                  <li key={company.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Truck className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="flex-1 font-medium text-gray-900 text-sm">{company.name}</p>
                    <button
                      onClick={() => handleDeleteCompany(company.id, company.name)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="حذف الشركة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
