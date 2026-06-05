import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Plus, Search, Trash2, Edit, Download, RefreshCw, Phone, X, Wifi, WifiOff } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import "./style.css";

const statuses = ["تم ارسال الـ URL", "تمت الاستشارة الطبية", "معلق", "تم الحجز"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm() {
  return {
    id: "",
    appointment_date: today(),
    patient_name: "",
    phone: "",
    status: "تم الحجز",
    notes: ""
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
    patient_name: row.patient_name || "",
    phone: row.phone || "",
    status: row.status || "تم الحجز",
    notes: row.notes || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || ""
  };
}

function App() {
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filters, setFilters] = useState({ q: "", date: "", status: "" });
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState("connecting");

  useEffect(() => {
    loadAppointments();

    const channel = supabase
      .channel("cells-lab-appointments-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => loadAppointments(false)
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
      .order("appointment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setConnection("error");
      showToast("خطأ في تحميل البيانات: " + error.message);
    } else {
      setAppointments((data || []).map(mapDbRow));
      setConnection("live");
    }

    if (showLoader) setLoading(false);
  }

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      const text = `${a.patient_name} ${a.phone} ${a.status} ${a.notes}`.toLowerCase();

      return (
        (!filters.q || text.includes(filters.q.toLowerCase())) &&
        (!filters.date || a.appointment_date === filters.date) &&
        (!filters.status || a.status === filters.status)
      );
    });
  }, [appointments, filters]);

  const stats = useMemo(() => {
    return {
      total: appointments.length,
      sentUrl: appointments.filter((a) => a.status === "تم ارسال الـ URL").length,
      consultationDone: appointments.filter((a) => a.status === "تمت الاستشارة الطبية").length,
      pending: appointments.filter((a) => a.status === "معلق").length,
      booked: appointments.filter((a) => a.status === "تم الحجز").length
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

    if (!form.appointment_date || !form.patient_name || !form.phone) {
      showToast("أدخل التاريخ الميلادي واسم العميل ورقم الجوال");
      return;
    }

    const payload = {
      appointment_date: form.appointment_date,
      patient_name: form.patient_name,
      phone: normalizePhone(form.phone),
      status: form.status || "تم الحجز",
      notes: form.notes || "",
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

    showToast(form.id ? "تم تعديل البيانات" : "تم إضافة الموعد");
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

    showToast("تم حذف الموعد");
    loadAppointments(false);
  }

  function exportExcel() {
    const rows = appointments.map((a) => ({
      "التاريخ الميلادي": a.appointment_date,
      "اسم العميل": a.patient_name,
      "رقم الجوال": a.phone,
      الحالة: a.status,
      ملاحظات: a.notes,
      "تاريخ الإضافة": a.created_at,
      "تاريخ التعديل": a.updated_at
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Cells Lab");
    XLSX.writeFile(wb, "cells-lab-records.xlsx");
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
          appointment_date: String(r["التاريخ الميلادي"] || r["التاريخ"] || r.appointment_date || today()).slice(0, 10),
          patient_name: String(r["اسم العميل"] || r["اسم المريض"] || r.patient_name || ""),
          phone: normalizePhone(r["رقم الجوال"] || r.phone || ""),
          status: String(r["الحالة"] || r.status || "تم الحجز"),
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

      showToast("تم استيراد البيانات");
      loadAppointments(false);
    };

    reader.readAsArrayBuffer(file);
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="heroText">
          <img src="/logo.png" alt="مختبرات الخلايا الطبية" className="logo" />
          <div>
            <h1>مختبرات الخلايا الطبية</h1>
            <p>نظام لايف لمتابعة العملاء، إرسال الروابط، والاستشارات الطبية.</p>
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
        <Stat label="إجمالي السجلات" value={stats.total} />
        <Stat label="تم ارسال الـ URL" value={stats.sentUrl} />
        <Stat label="تمت الاستشارة الطبية" value={stats.consultationDone} />
        <Stat label="معلق" value={stats.pending} />
        <Stat label="تم الحجز" value={stats.booked} />
      </section>

      <section className="panel filters">
        <div className="field searchField">
          <label>بحث</label>
          <div className="inputIcon">
            <Search size={18} />
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="الاسم، الجوال، الملاحظات..." />
          </div>
        </div>

        <div className="field">
          <label>التاريخ الميلادي</label>
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </div>

        <div className="field">
          <label>الحالة</label>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">كل الحالات</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>
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
                  <th>التاريخ الميلادي</th>
                  <th>اسم العميل</th>
                  <th>رقم الجوال</th>
                  <th>الحالة</th>
                  <th>ملاحظات</th>
                  <th>تاريخ الإضافة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan="7" className="empty">لا توجد بيانات مطابقة</td></tr>
                ) : filtered.map((item) => {
                  const phone = normalizePhone(item.phone);
                  return (
                    <tr key={item.id}>
                      <td>{item.appointment_date}</td>
                      <td><strong>{item.patient_name}</strong></td>
                      <td>
                        <div>{item.phone}</div>
                        {phone.startsWith("966") && (
                          <a className="whatsapp" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer"><Phone size={14} /> واتساب</a>
                        )}
                      </td>
                      <td><span className={`badge ${item.status.replace(/\s/g, "-").replace("الـ", "url")}`}>{item.status}</span></td>
                      <td className="notes">{item.notes}</td>
<td>
  {item.created_at
    ? new Date(item.created_at).toLocaleString("ar-SA-u-ca-gregory", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })
    : ""}
</td>                      <td>
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
              <Field label="التاريخ الميلادي *"><input type="date" value={form.appointment_date} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} /></Field>
              <Field label="اسم العميل *"><input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} placeholder="اسم العميل" /></Field>
              <Field label="رقم الجوال *"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xxxxxxxx" /></Field>
              <Field label="الحالة"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="ملاحظات" wide><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="4" placeholder="اكتب الملاحظات هنا" /></Field>
              <div className="modalFooter">
                <button className="btn btnPrimary" type="submit">حفظ</button>
                <button className="btn btnGhost" type="button" onClick={() => setForm(emptyForm())}>مسح</button>
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
