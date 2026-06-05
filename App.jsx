import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, Plus, Search, Trash2, Edit, Download, RefreshCw, Phone, X, Wifi, WifiOff } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import "./style.css";

const statuses = ["انتظار", "مؤكد", "تم التواصل", "ملغي"];
const departments = ["تحاليل", "زيارة منزلية", "استشارة", "متابعة", "أخرى"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    id: "",
    appointment_date: today(),
    appointment_time: "",
    patient_name: "",
    phone: "",
    doctor: "",
    department: "تحاليل",
    status: "انتظار",
    notes: "",
    employee: ""
  };
}

function normalizePhone(phone) {
  let digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.startsWith("05")) digits = "966" + digits.slice(1);
  if (digits.startsWith("5")) digits = "966" + digits;
  return digits;
}

function mapDbRow(row) {
  return {
    id: row.id,
    appointment_date: row.appointment_date || "",
    appointment_time: row.appointment_time || "",
    patient_name: row.patient_name || "",
    phone: row.phone || "",
    doctor: row.doctor || "",
    department: row.department || "",
    status: row.status || "انتظار",
    employee: row.employee || "",
    notes: row.notes || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || ""
  };
}

function App() {
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState({ q: "", date: "", status: "", doctor: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState("connecting");

  useEffect(() => {
    loadAppointments();

    const channel = supabase
      .channel("appointments-live-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          loadAppointments(false);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("error");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadAppointments(showLoader = true) {
    if (showLoader) setLoading(true);

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (error) {
      console.error(error);
      setConnection("error");
      showToast("خطأ في تحميل البيانات: " + error.message);
    } else {
      setAppointments((data || []).map(mapDbRow));
      if (connection !== "live") setConnection("live");
    }

    if (showLoader) setLoading(false);
  }

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      const text = `${a.patient_name} ${a.phone} ${a.doctor} ${a.department} ${a.status} ${a.employee} ${a.notes}`.toLowerCase();
      return (
        (!filters.q || text.includes(filters.q.toLowerCase())) &&
        (!filters.date || a.appointment_date === filters.date) &&
        (!filters.status || a.status === filters.status) &&
        (!filters.doctor || String(a.doctor).toLowerCase().includes(filters.doctor.toLowerCase()))
      );
    });
  }, [appointments, filters]);

  const stats = useMemo(() => {
    return {
      total: appointments.length,
      todayCount: appointments.filter((a) => a.appointment_date === today()).length,
      confirmed: appointments.filter((a) => a.status === "مؤكد").length,
      pending: appointments.filter((a) => a.status === "انتظار").length
    };
  }, [appointments]);

  function showToast(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3200);
  }

  function openAddModal() {
    setForm(emptyForm());
    setIsModalOpen(true);
  }

  function openEditModal(item) {
    setForm(item);
    setIsModalOpen(true);
  }

  async function saveAppointment(e) {
    e.preventDefault();

    if (!form.appointment_date || !form.appointment_time || !form.patient_name || !form.phone || !form.doctor) {
      showToast("أدخل التاريخ والوقت واسم المريض ورقم الجوال والطبيب");
      return;
    }

    const conflictQuery = supabase
      .from("appointments")
      .select("id")
      .eq("appointment_date", form.appointment_date)
      .eq("appointment_time", form.appointment_time)
      .eq("doctor", form.doctor);

    const { data: conflictData, error: conflictError } = await conflictQuery;

    if (conflictError) {
      showToast("تعذر فحص تعارض المواعيد: " + conflictError.message);
      return;
    }

    const hasConflict = (conflictData || []).some((x) => x.id !== form.id);
    if (hasConflict) {
      showToast("يوجد موعد لنفس الطبيب في نفس التاريخ والوقت");
      return;
    }

    const payload = {
      appointment_date: form.appointment_date,
      appointment_time: form.appointment_time,
      patient_name: form.patient_name,
      phone: normalizePhone(form.phone),
      doctor: form.doctor,
      department: form.department,
      status: form.status,
      employee: form.employee,
      notes: form.notes,
      updated_at: new Date().toISOString()
    };

    let result;

    if (form.id) {
      result = await supabase.from("appointments").update(payload).eq("id", form.id);
    } else {
      result = await supabase.from("appointments").insert(payload);
    }

    if (result.error) {
      showToast("خطأ أثناء الحفظ: " + result.error.message);
      return;
    }

    showToast(form.id ? "تم تعديل الموعد لايف" : "تم إضافة الموعد لايف");
    setIsModalOpen(false);
    loadAppointments(false);
  }

  async function deleteAppointment(id) {
    if (!confirm("هل تريد حذف هذا الموعد؟")) return;

    const { error } = await supabase.from("appointments").delete().eq("id", id);

    if (error) {
      showToast("خطأ أثناء الحذف: " + error.message);
      return;
    }

    showToast("تم حذف الموعد لايف");
    loadAppointments(false);
  }

  function exportExcel() {
    const rows = appointments.map((a) => ({
      التاريخ: a.appointment_date,
      الوقت: a.appointment_time,
      "اسم المريض": a.patient_name,
      "رقم الجوال": a.phone,
      الطبيب: a.doctor,
      القسم: a.department,
      الحالة: a.status,
      الموظف: a.employee,
      ملاحظات: a.notes,
      "تاريخ الإضافة": a.created_at,
      "تاريخ التعديل": a.updated_at
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Appointments");
    XLSX.writeFile(wb, "cells-lab-live-appointments.xlsx");
  }

  async function importExcel(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      const imported = rows
        .map((r) => ({
          appointment_date: String(r["التاريخ"] || r.appointment_date || today()).slice(0, 10),
          appointment_time: String(r["الوقت"] || r.appointment_time || ""),
          patient_name: String(r["اسم المريض"] || r.patient_name || ""),
          phone: normalizePhone(r["رقم الجوال"] || r.phone || ""),
          doctor: String(r["الطبيب"] || r.doctor || ""),
          department: String(r["القسم"] || r.department || "تحاليل"),
          status: String(r["الحالة"] || r.status || "انتظار"),
          employee: String(r["الموظف"] || r.employee || ""),
          notes: String(r["ملاحظات"] || r.notes || "")
        }))
        .filter((r) => r.patient_name || r.phone);

      if (!imported.length) {
        showToast("لم يتم العثور على بيانات قابلة للاستيراد");
        return;
      }

      const { error } = await supabase.from("appointments").insert(imported);

      if (error) {
        showToast("خطأ أثناء الاستيراد: " + error.message);
        return;
      }

      showToast("تم استيراد البيانات لايف");
      loadAppointments(false);
    };

    reader.readAsArrayBuffer(file);
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="heroText">
          <div className="iconBubble"><CalendarDays size={28} /></div>
          <div>
            <h1>مختبرات الخلايا الطبية</h1>
            <p>نظام لايف لإدارة مواعيد المختبر والمرضى، متزامن بين كل الموظفين عبر Supabase وVercel.</p>
            <div className={`connection ${connection}`}>
              {connection === "live" ? <Wifi size={15} /> : <WifiOff size={15} />}
              {connection === "live" ? "متصل لايف" : connection === "connecting" ? "جاري الاتصال" : "مشكلة اتصال"}
            </div>
          </div>
        </div>

        <div className="heroActions">
          <button className="btn btnLight" onClick={openAddModal}><Plus size={18} /> إضافة موعد</button>
          <button className="btn btnPrimary" onClick={exportExcel}><Download size={18} /> تصدير Excel</button>
          <label className="btn btnGhost fileBtn">
            استيراد Excel
            <input type="file" accept=".xlsx,.xls" onChange={importExcel} />
          </label>
        </div>
      </section>

      <section className="stats">
        <Stat label="إجمالي المواعيد" value={stats.total} />
        <Stat label="مواعيد اليوم" value={stats.todayCount} />
        <Stat label="مؤكد" value={stats.confirmed} />
        <Stat label="انتظار" value={stats.pending} />
      </section>

      <section className="panel filters">
        <div className="field searchField">
          <label>بحث</label>
          <div className="inputIcon">
            <Search size={18} />
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="الاسم، الجوال، الطبيب..." />
          </div>
        </div>

        <div className="field">
          <label>التاريخ</label>
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </div>

        <div className="field">
          <label>الحالة</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">كل الحالات</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="field">
          <label>الطبيب</label>
          <input value={filters.doctor} onChange={(e) => setFilters({ ...filters, doctor: e.target.value })} placeholder="اسم الطبيب" />
        </div>

        <button className="btn btnGhost" onClick={() => loadAppointments()}><RefreshCw size={16} /> تحديث</button>
      </section>

      <section className="panel">
        {loading ? (
          <div className="empty">جاري تحميل البيانات...</div>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الوقت</th>
                  <th>اسم المريض</th>
                  <th>الجوال</th>
                  <th>الطبيب</th>
                  <th>القسم</th>
                  <th>الحالة</th>
                  <th>الموظف</th>
                  <th>ملاحظات</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="10" className="empty">لا توجد مواعيد مطابقة</td></tr>
                ) : filtered.map((item) => {
                  const phone = normalizePhone(item.phone);
                  return (
                    <tr key={item.id}>
                      <td>{item.appointment_date}</td>
                      <td>{item.appointment_time}</td>
                      <td><strong>{item.patient_name}</strong></td>
                      <td>
                        <div>{item.phone}</div>
                        {phone.startsWith("966") && (
                          <a className="whatsapp" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><Phone size={14} /> واتساب</a>
                        )}
                      </td>
                      <td>{item.doctor}</td>
                      <td>{item.department}</td>
                      <td><span className={`badge ${item.status.replace(/\s/g, "-")}`}>{item.status}</span></td>
                      <td>{item.employee}</td>
                      <td className="notes">{item.notes}</td>
                      <td>
                        <div className="rowActions">
                          <button className="miniBtn" onClick={() => openEditModal(item)}><Edit size={15} /></button>
                          <button className="miniBtn danger" onClick={() => deleteAppointment(item.id)}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="modalOverlay" onMouseDown={(e) => e.target.className === "modalOverlay" && setIsModalOpen(false)}>
          <div className="modal">
            <div className="modalHead">
              <h2>{form.id ? "تعديل موعد" : "إضافة موعد"}</h2>
              <button className="closeBtn" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={saveAppointment} className="form">
              <Field label="التاريخ *"><input type="date" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} /></Field>
              <Field label="الوقت *"><input type="time" value={form.appointment_time} onChange={(e) => setForm({ ...form, appointment_time: e.target.value })} /></Field>
              <Field label="اسم المريض *"><input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} placeholder="اسم المريض" /></Field>
              <Field label="رقم الجوال *"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" /></Field>
              <Field label="الطبيب / المختص *"><input value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })} placeholder="اسم الطبيب أو المختص" /></Field>
              <Field label="القسم"><select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>{departments.map((d) => <option key={d}>{d}</option>)}</select></Field>
              <Field label="الحالة"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="الموظف"><input value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })} placeholder="اسم الموظف" /></Field>
              <Field label="ملاحظات" wide><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="3" placeholder="أي ملاحظات مهمة" /></Field>
              <div className="modalFooter">
                <button className="btn btnPrimary" type="submit">{form.id ? "حفظ التعديل" : "حفظ الموعد"}</button>
                <button className="btn btnGhost" type="button" onClick={() => setForm(emptyForm())}>تفريغ</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Stat({ label, value }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Field({ label, children, wide }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>;
}

createRoot(document.getElementById("root")).render(<App />);
