let deferredPrompt = null;

// Service Worker Registration (Move here to maximize capture window)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => {
            console.log('Service Worker: Registered');
            reg.update(); // Force update check
        })
        .catch(err => console.error('Service Worker: Registration Failed', err));
}

// Catch the install prompt as early as possible
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('PWA: Ready to install. Prompt object available.');
    app.updateInstallButtons();
});

window.addEventListener('appinstalled', (evt) => {
    console.log('PWA: App installed successfully');
    deferredPrompt = null;
    document.getElementById('pwa-install-header')?.classList.add('hidden');
    document.getElementById('pwa-install-landing')?.classList.add('hidden');
});

const API_BASE = window.location.origin + '/api';

const app = {
    state: {
        user: null,
        today: '',
        tomorrow: '',
        selection: { breakfast: null, lunch: null },
        isOnline: navigator.onLine
    },

    init: async function () {
        // Initial check for current day
        const d = new Date();
        const t = new Date();
        t.setDate(d.getDate() + 1);

        this.state.today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        this.state.tomorrow = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
        const session = localStorage.getItem('sm_session');
        if (session) {
            try {
                this.state.user = JSON.parse(session);
                this.router.go(this.state.user.role);
            } catch (e) {
                localStorage.removeItem('sm_session');
                this.router.show('view-login');
            }
        } else {
            this.router.show('view-login');
        }

        const messDateEl = document.getElementById('mess-date');
        if (messDateEl) messDateEl.value = this.state.tomorrow;

        const studentDateEl = document.getElementById('student-date');
        if (studentDateEl) {
            const t = new Date();
            t.setDate(t.getDate() + 1);
            studentDateEl.textContent = t.toDateString();
        }

        // Standalone detection for PWA Install Buttons
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

        if (isStandalone) {
            this.updateInstallButtons(false); // Already installed and running
        } else {
            this.updateInstallButtons(true); // Show by default as a fallback
        }
    },

    auth: {
        login: async function (e) {
            e.preventDefault();
            const btn = document.getElementById('btn-login-submit');
            const errorBox = document.getElementById('login-error');

            const originalText = btn.innerHTML;
            btn.innerHTML = '<div class="spinner"></div> Checking...';
            btn.disabled = true;
            errorBox.classList.add('hidden');

            const id = document.getElementById('login-id').value.trim();
            const pass = document.getElementById('login-pass').value;

            try {
                const res = await fetch(`${API_BASE}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, password: pass })
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Login failed');
                }

                const user = await res.json();
                app.state.user = user;
                localStorage.setItem('sm_session', JSON.stringify(user));
                app.router.go(user.role);
                document.getElementById('login-form').reset();
            } catch (err) {
                errorBox.textContent = err.message || err;
                errorBox.classList.remove('hidden');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        },
        togglePassword: function () {
            const passInput = document.getElementById('login-pass');
            const toggleIcon = document.querySelector('.password-toggle-icon');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                toggleIcon.textContent = 'visibility_off';
            } else {
                passInput.type = 'password';
                toggleIcon.textContent = 'visibility';
            }
        },
        logout: function () {
            app.state.user = null;
            localStorage.removeItem('sm_session');
            app.router.show('view-login');
            location.reload();
        }
    },

    showToast: function (msg, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: 'check_circle',
            error: 'cancel',
            info: 'info'
        };

        toast.innerHTML = `
            <div class="toast-icon">
                <span class="material-symbols-rounded">${icons[type] || 'info'}</span>
            </div>
            <div class="toast-content">
                <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                <div class="toast-msg">${msg}</div>
            </div>
        `;

        container.appendChild(toast);

        // Trigger show animation
        setTimeout(() => toast.classList.add('active'), 100);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 400);
        }, duration);
    },

    confirm: function (title, msg, type = 'danger') {
        const modal = document.getElementById('c-confirm-modal');
        const titleEl = document.getElementById('c-confirm-title');
        const msgEl = document.getElementById('c-confirm-msg');
        const confirmBtn = document.getElementById('btn-c-confirm');
        const cancelBtn = document.getElementById('btn-c-cancel');
        const iconEl = modal.querySelector('.c-modal-icon span');

        titleEl.textContent = title;
        msgEl.textContent = msg;

        // Color theme for modal
        if (type === 'danger') {
            confirmBtn.style.background = '#e11d48';
            modal.querySelector('.c-modal-icon').style.background = '#fff1f2';
            modal.querySelector('.c-modal-icon').style.color = '#e11d48';
            iconEl.textContent = 'delete_forever';
        } else {
            confirmBtn.style.background = '#6366f1';
            modal.querySelector('.c-modal-icon').style.background = '#eef2ff';
            modal.querySelector('.c-modal-icon').style.color = '#6366f1';
            iconEl.textContent = 'help';
        }

        modal.classList.add('active');

        return new Promise((resolve) => {
            const handleConfirm = () => {
                modal.classList.remove('active');
                cleanup();
                resolve(true);
            };
            const handleCancel = () => {
                modal.classList.remove('active');
                cleanup();
                resolve(false);
            };
            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        });
    },

    router: {
        show: function (viewId) {
            document.querySelectorAll('section').forEach(el => el.classList.add('hidden'));
            document.getElementById(viewId).classList.remove('hidden');
            const header = document.getElementById('app-header');
            const whatsappBtn = document.getElementById('global-whatsapp-fab');

            if (viewId === 'view-login') {
                header.classList.add('hidden');
                whatsappBtn?.classList.add('hidden');
            } else {
                header.classList.remove('hidden');
                document.getElementById('header-user-name').textContent = app.state.user.name;

                // Only show WhatsApp button for Admin view
                if (viewId === 'view-admin') whatsappBtn?.classList.remove('hidden');
                else whatsappBtn?.classList.add('hidden');
            }
        },
        go: function (role) {
            this.show(`view-${role}`);
            if (role === 'student') app.student.load();
            if (role === 'admin') app.admin.load();
            if (role === 'mess') app.mess.load();
        }
    },

    student: {
        load: async function () {
            try {
                if (this._countdownInterval) clearInterval(this._countdownInterval);
                const settingsRes = await fetch(`${API_BASE}/admin/settings`);
                const settings = await settingsRes.json();

                const statusRes = await fetch(`${API_BASE}/student/status?userId=${app.state.user.id}&date=${app.state.tomorrow}`);

                const now = new Date();

                const [s_hh, s_mm] = (settings.startTime || '00:00').split(':');
                const startDate = new Date();
                startDate.setHours(parseInt(s_hh, 10), parseInt(s_mm, 10), 0, 0);

                const [hh, mm] = settings.cutoff.split(':');
                const cutoffDate = new Date();
                cutoffDate.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);

                const isTooEarly = now < startDate;
                const isTooLate = now > cutoffDate;

                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() + 1);
                const isTomorrowSunday = targetDate.getDay() === 0;

                const isLocked = isTooEarly || isTooLate || settings.holiday || isTomorrowSunday;

                let lockMsg = '';
                if (settings.holiday) lockMsg = 'Today is marked as a Holiday by Admin.';
                else if (isTomorrowSunday) lockMsg = 'Tomorrow (Sunday) is a weekly holiday. No food served.';
                else if (isTooEarly) lockMsg = `Submissions have not started yet. Starts at ${settings.startTime || '00:00'}.`;
                else if (isTooLate) lockMsg = `Submissions are closed. Passed cutoff time of ${settings.cutoff}.`;

                const statusTitle = document.getElementById('student-status-title');
                const statusMsg = document.getElementById('student-status-msg');
                const dataDiv = document.getElementById('student-saved-data');

                if (statusRes.ok) {
                    const mySub = await statusRes.json();
                    document.getElementById('student-form').classList.add('hidden');
                    document.getElementById('student-locked').classList.remove('hidden');

                    statusTitle.textContent = "Your today's choice is over";
                    statusTitle.className = "font-bold text-xl mb-2 text-emerald-600";
                    statusMsg.textContent = "You have successfully submitted your selection for tomorrow.";

                    dataDiv.innerHTML = `
                        <div class="flex flex-col gap-2">
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-slate-500">Breakfast</span>
                                <span class="badge ${mySub.breakfast ? 'badge-yes' : 'badge-no'}">${mySub.breakfast ? 'YES' : 'NO'}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-sm font-medium text-slate-500">Lunch</span>
                                <span class="badge ${mySub.lunch ? 'badge-yes' : 'badge-no'}">${mySub.lunch ? 'YES' : 'NO'}</span>
                            </div>
                        </div>
                        <p class="text-[10px] text-muted mt-4 text-center uppercase tracking-widest font-bold">Selection locked for tomorrow</p>
                    `;

                    this.startCountdown(settings.startTime);
                } else {
                    if (isLocked) {
                        document.getElementById('student-form').classList.add('hidden');
                        document.getElementById('student-locked').classList.remove('hidden');

                        statusTitle.textContent = isTooEarly ? 'Opens Soon' : 'Submissions Closed';
                        statusTitle.className = "font-bold text-xl mb-2 text-slate-800";
                        statusMsg.textContent = lockMsg;
                        dataDiv.innerHTML = `<p class="text-center text-slate-400 py-2 italic text-sm">Action required at opening time</p>`;

                        this.startCountdown(settings.startTime);
                    } else {
                        document.getElementById('student-form').classList.remove('hidden');
                        document.getElementById('student-locked').classList.add('hidden');
                    }
                }
            } catch (err) {
                console.error('Error loading student data:', err);
            }
        },
        set: function (meal, val) {
            app.state.selection[meal] = val;
            const wrapper = document.querySelectorAll('.toggle-wrapper');
            const idx = meal === 'breakfast' ? 0 : 1;
            const opts = wrapper[idx].children;
            opts[0].className = `toggle-opt ${val === true ? 'active-yes' : ''}`;
            opts[1].className = `toggle-opt ${val === false ? 'active-no' : ''}`;
            const btn = document.getElementById('btn-submit-count');
            btn.disabled = !(app.state.selection.breakfast !== null && app.state.selection.lunch !== null);
        },
        submit: async function () {
            const { breakfast, lunch } = app.state.selection;
            try {
                const res = await fetch(`${API_BASE}/student/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: app.state.user.id, date: app.state.tomorrow, breakfast, lunch })
                });
                if (res.ok) {
                    app.showToast('Submission Saved!', 'success');
                    app.student.load();
                } else {
                    const data = await res.json().catch(() => ({}));
                    app.showToast(data.error || 'Failed to submit', 'error');
                }
            } catch (err) {
                console.error('Submit error:', err);
            }
        },

        startCountdown: function (startTimeStr) {
            const update = () => {
                const now = new Date();
                const target = new Date();
                // If it's already past the target time today, target is tomorrow
                const [h, m] = (startTimeStr || '00:00').split(':');
                target.setHours(parseInt(h), parseInt(m), 0, 0);
                if (now >= target) target.setDate(target.getDate() + 1);
                const diff = target - now;
                if (diff < 0) {
                    const el = document.getElementById('opening-countdown');
                    if (el) el.textContent = "00:00:00";
                    return;
                }
                const hh = Math.floor(diff / (1000 * 60 * 60));
                const mm = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const ss = Math.floor((diff % (1000 * 60)) / 1000);
                const display = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
                const el = document.getElementById('opening-countdown');
                if (el) el.textContent = display;
            };
            update();
            this._countdownInterval = setInterval(update, 1000);
        }
    },

    admin: {
        load: async function () {
            try {
                const batchSelect = document.getElementById('new-stu-batch');
                if (batchSelect && batchSelect.options.length <= 1) {
                    for (let y = 2026; y <= 2036; y++) {
                        batchSelect.add(new Option(y, y));
                    }
                }

                const settingsRes = await fetch(`${API_BASE}/admin/settings`);
                const settings = await settingsRes.json();
                document.getElementById('adm-start').value = settings.startTime || '00:00';
                document.getElementById('adm-cutoff').value = settings.cutoff;
                document.getElementById('adm-holiday').checked = settings.holiday;

                await this.renderStats();
                await this.renderList();

                // Load Guests for tomorrow
                const guestRes = await fetch(`${API_BASE}/admin/guests?date=${app.state.tomorrow}`);
                const guestData = await guestRes.json();
                document.getElementById('new-guest-bf').value = guestData.breakfast || 0;
                document.getElementById('new-guest-lu').value = guestData.lunch || 0;

                // Set default month/year for monthly report
                const now = new Date();
                document.getElementById('adm-month-select').value = now.getMonth() + 1;
                document.getElementById('adm-year-select').value = now.getFullYear();
                await this.renderMonthlyReport();

                document.getElementById('admin-report-date').value = app.state.tomorrow;
                await this.renderReport();
            } catch (err) {
                console.error('Admin load error:', err);
            }
        },
        saveSettings: async function () {
            const startTime = document.getElementById('adm-start').value;
            const cutoff = document.getElementById('adm-cutoff').value;
            const holiday = document.getElementById('adm-holiday').checked;
            try {
                const res = await fetch(`${API_BASE}/admin/settings`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startTime, cutoff, holiday })
                });
                if (res.ok) {
                    app.showToast('System Settings Updated', 'success');
                }
            } catch (err) {
                console.error('Save settings error:', err);
            }
        },
        renderStats: async function () {
            try {
                const res = await fetch(`${API_BASE}/admin/stats?date=${app.state.tomorrow}`);
                const stats = await res.json();
                document.getElementById('adm-total-students').textContent = stats.totalStudents;
                document.getElementById('adm-breakfast').textContent = stats.breakfast;
                document.getElementById('adm-lunch').textContent = stats.lunch;
                document.getElementById('adm-guests').textContent = `${stats.guests.breakfast} / ${stats.guests.lunch}`;
            } catch (err) {
                console.error('Stats error:', err);
            }
        },
        renderList: async function () {
            try {
                const res = await fetch(`${API_BASE}/admin/students`);
                const students = await res.json();
                // Cache the full list for client-side filtering
                app.admin._allStudents = students;

                // Populate batch filter dropdown dynamically from actual data
                const filterBatch = document.getElementById('filter-batch');
                const filterReportBatch = document.getElementById('filter-report-batch');

                const existingBatches = new Set(
                    [...filterBatch.options].slice(1).map(o => o.value)
                );
                students.forEach(s => {
                    if (s.batch && !existingBatches.has(String(s.batch))) {
                        existingBatches.add(String(s.batch));
                        const opt1 = new Option(s.batch, s.batch);
                        const opt2 = new Option(s.batch, s.batch);
                        filterBatch.add(opt1);
                        filterReportBatch?.add(opt2);
                    }
                });
                // Sort batch options
                const sortBatch = (sel) => {
                    if (!sel) return;
                    const opts = [...sel.options].slice(1).sort((a, b) => a.value - b.value);
                    while (sel.options.length > 1) sel.remove(1);
                    opts.forEach(o => sel.add(o));
                };
                sortBatch(filterBatch);
                sortBatch(filterReportBatch);

                this.applyFilter();
            } catch (err) {
                console.error('List error:', err);
            }
        },
        applyFilter: function () {
            const filterCourse = document.getElementById('filter-course').value;
            const filterBatch = document.getElementById('filter-batch').value;
            const students = app.admin._allStudents || [];

            const filtered = students.filter(s => {
                const courseMatch = !filterCourse || s.course === filterCourse;
                const batchMatch = !filterBatch || String(s.batch) === String(filterBatch);
                return courseMatch && batchMatch;
            });

            const tbody = document.querySelector('#admin-student-list tbody');
            const emptyMsg = document.getElementById('student-list-empty');
            const badge = document.getElementById('student-count-badge');

            tbody.innerHTML = '';
            if (filtered.length === 0) {
                emptyMsg.classList.remove('hidden');
                badge.textContent = '0 students';
            } else {
                emptyMsg.classList.add('hidden');
                badge.textContent = `${filtered.length} student${filtered.length !== 1 ? 's' : ''}`;
                filtered.forEach(s => {
                    tbody.innerHTML += `
                        <tr>
                            <td data-label="College ID">${s.collegeId}</td>
                            <td data-label="Name">${s.name}</td>
                            <td data-label="Course">${s.course || '-'}</td>
                            <td data-label="Batch">${s.batch || '-'}</td>
                            <td data-label="Action"><button class="text-red-500 font-bold" onclick="app.admin.delStudent('${s.collegeId}')">Delete</button></td>
                        </tr>
                    `;
                });
            }
        },
        clearFilter: function () {
            document.getElementById('filter-course').value = '';
            document.getElementById('filter-batch').value = '';
            this.applyFilter();
        },
        renderReport: async function () {
            const date = document.getElementById('admin-report-date').value;
            const filterCourse = document.getElementById('filter-report-course').value;
            const filterBatch = document.getElementById('filter-report-batch').value;

            try {
                const res = await fetch(`${API_BASE}/mess/report?date=${date}`);
                const allSubs = await res.json();

                const filtered = allSubs.filter(s => {
                    const courseMatch = !filterCourse || s.course === filterCourse;
                    const batchMatch = !filterBatch || String(s.batch) === String(filterBatch);
                    return courseMatch && batchMatch;
                });

                const tbody = document.querySelector('#admin-report-table tbody');
                tbody.innerHTML = '';
                filtered.forEach(s => {
                    tbody.innerHTML += `
                        <tr>
                            <td data-label="ID">${s.userId}</td>
                            <td data-label="Name">${s.userName}</td>
                            <td data-label="Breakfast" class="text-center"><span class="badge ${s.breakfast ? 'badge-yes' : 'badge-no'}">${s.breakfast ? 'Yes' : 'No'}</span></td>
                            <td data-label="Lunch" class="text-center"><span class="badge ${s.lunch ? 'badge-yes' : 'badge-no'}">${s.lunch ? 'Yes' : 'No'}</span></td>
                        </tr>
                    `;
                });
            } catch (err) {
                console.error('Report error:', err);
            }
        },
        addStudent: async function () {
            const name = document.getElementById('new-stu-name').value;
            const id = document.getElementById('new-stu-id').value;
            const pass = document.getElementById('new-stu-pass').value;
            const course = document.getElementById('new-stu-course').value;
            const batch = document.getElementById('new-stu-batch').value;

            if (!name || !id || !pass) return app.showToast("Fill all required fields", "info");

            try {
                const res = await fetch(`${API_BASE}/admin/students`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collegeId: id, name, password: pass, course, batch })
                });
                if (res.ok) {
                    app.showToast(`Student ${name} Added`, 'success');
                    document.getElementById('new-stu-name').value = '';
                    document.getElementById('new-stu-id').value = '';
                    document.getElementById('new-stu-pass').value = '';
                    document.getElementById('new-stu-course').value = '';
                    document.getElementById('new-stu-batch').value = '';
                    this.renderList();
                    this.renderStats();
                } else {
                    const data = await res.json().catch(() => ({}));
                    app.showToast(data.error || 'Failed to add student', 'error');
                }
            } catch (err) {
                console.error('Add student error:', err);
            }
        },
        delStudent: async function (id) {
            const confirmed = await app.confirm('Delete Student?', `Are you sure you want to delete student ID ${id}?`);
            if (!confirmed) return;
            try {
                const res = await fetch(`${API_BASE}/admin/students/${id}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    this.renderList();
                    this.renderStats();
                }
            } catch (err) {
                console.error('Delete student error:', err);
            }
        },
        sendWhatsAppReport: async function () {
            const date = document.getElementById('admin-report-date').value;
            const btn = document.querySelector('.whatsapp-fab');
            const originalIcon = btn.innerHTML;

            try {
                btn.innerHTML = '<div class="spinner" style="width:20px; height:20px; border-width:2px;"></div>';
                const res = await fetch(`${API_BASE}/admin/stats?date=${date}`);
                const stats = await res.json();

                const formattedDate = new Date(date).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });

                const gBf = stats.guests?.breakfast || 0;
                const gLu = stats.guests?.lunch || 0;

                const message = encodeURIComponent(
                    `*Smart Mess Attendance Report*\n` +
                    `----------------------------\n` +
                    `*Date:* ${formattedDate}\n` +
                    `*Total Students:* ${stats.totalStudents}\n` +
                    `*Breakfast Count:* ${stats.breakfast}\n` +
                    `*Lunch Count:* ${stats.lunch}\n` +
                    `*Guest Count (B/L):* ${gBf} / ${gLu}\n` +
                    `----------------------------\n` +
                    `*Total Prep (B/L):* ${stats.breakfast + gBf} / ${stats.lunch + gLu}\n` +
                    `----------------------------\n` +
                    `_Generated by CBS Smart Mess Application_`
                );

                const phoneNumber = '919380450331';
                window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
            } catch (err) {
                console.error('WhatsApp report error:', err);
                alert('Failed to generate report. Please try again.');
            } finally {
                btn.innerHTML = originalIcon;
            }
        },
        renderMonthlyReport: async function () {
            const month = document.getElementById('adm-month-select').value;
            const year = document.getElementById('adm-year-select').value;
            const fromDate = document.getElementById('adm-month-from').value;
            const toDate = document.getElementById('adm-month-to').value;

            const tbody = document.querySelector('#monthly-report-breakdown tbody');
            const bfTotalEl = document.getElementById('mon-total-bf');
            const luTotalEl = document.getElementById('mon-total-lu');
            const genTimeEl = document.getElementById('report-gen-time');

            try {
                const res = await fetch(`${API_BASE}/admin/monthly-report?month=${month}&year=${year}`);
                const data = await res.json();

                genTimeEl.textContent = new Date().toLocaleString();

                tbody.innerHTML = '';
                let displayData = data.daily;

                // Filter by date range if requested
                if (fromDate || toDate) {
                    displayData = data.daily.filter(d => {
                        const dStr = d.date.split('T')[0];
                        if (fromDate && dStr < fromDate) return false;
                        if (toDate && dStr > toDate) return false;
                        return true;
                    });
                }

                // Recalculate totals for the filtered/displayed range
                let rangeBf = 0;
                let rangeLu = 0;
                displayData.forEach(d => {
                    rangeBf += d.breakfast + (d.guests ? d.guests.breakfast : 0);
                    rangeLu += d.lunch + (d.guests ? d.guests.lunch : 0);
                });
                bfTotalEl.textContent = rangeBf;
                luTotalEl.textContent = rangeLu;

                if (displayData.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted p-8">No data found for this selection</td></tr>';
                } else {
                    displayData.forEach(d => {
                        const dateObj = new Date(d.date);
                        const dayStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                        const weekday = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                        const gBf = d.guests ? d.guests.breakfast : 0;
                        const gLu = d.guests ? d.guests.lunch : 0;

                        tbody.innerHTML += `
                            <tr>
                                <td data-label="Date"><strong>${dayStr}</strong> (${weekday})</td>
                                <td data-label="Breakfast" class="text-center">
                                    ${d.breakfast} <span class="guest-label">(+${gBf})</span>
                                </td>
                                <td data-label="Lunch" class="text-center">
                                    ${d.lunch} <span class="guest-label">(+${gLu})</span>
                                </td>
                                <td data-label="Total" class="text-center">
                                    ${d.breakfast + d.lunch + gBf + gLu}
                                </td>
                            </tr>
                        `;
                    });
                }
            } catch (err) {
                console.error('Monthly report logic error:', err);
            }
        },
        onMonthlyDateChange: function () {
            // Deprecated
        },
        printMonthlyReport: function () {
            const mSelect = document.getElementById('adm-month-select');
            const ySelect = document.getElementById('adm-year-select');
            const mName = mSelect.options[mSelect.selectedIndex].text;
            const year = ySelect.value;
            
            const fromDate = document.getElementById('adm-month-from').value;
            const toDate = document.getElementById('adm-month-to').value;
            const rangeText = (fromDate || toDate) ? `<br><small>Range: ${fromDate || 'Start'} to ${toDate || 'End'}</small>` : '';
            
            const printArea = document.getElementById('print-area');
            const tableClone = document.getElementById('monthly-report-breakdown').cloneNode(true);
            
            // Format for professional print
            printArea.innerHTML = `
                <div class="print-header">
                    <h1>Chetan Business School</h1>
                    <h2>Monthly Mess Attendance Report - ${mName} ${year}${rangeText}</h2>
                    <p style="margin-top:10px">Total Breakfast: ${document.getElementById('mon-total-bf').textContent} | Total Lunch: ${document.getElementById('mon-total-lu').textContent}</p>
                </div>
            `;
            printArea.appendChild(tableClone);

            window.print();
        },
        printDailyReport: function () {
            const date = document.getElementById('admin-report-date').value || new Date().toISOString().split('T')[0];
            const tableClone = document.getElementById('admin-report-table').cloneNode(true);
            const printArea = document.getElementById('print-area');

            printArea.innerHTML = `
                <div class="print-header">
                    <h1>Chetan Business School</h1>
                    <h2>Daily Mess Attendance Report - ${date}</h2>
                </div>
            `;
            printArea.appendChild(tableClone);

            window.print();
        },
        saveGuests: async function () {
            const bfInput = document.getElementById('new-guest-bf');
            const luInput = document.getElementById('new-guest-lu');
            const bf = parseInt(bfInput.value) || 0;
            const lu = parseInt(luInput.value) || 0;
            const date = app.state.tomorrow;

            try {
                const res = await fetch(`${API_BASE}/admin/guests`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, breakfast: bf, lunch: lu })
                });

                if (res.ok) {
                    app.showToast('Guest counts updated', 'success');
                    await this.renderStats();
                    await this.renderMonthlyReport();
                } else {
                    const errorData = await res.json().catch(() => ({ error: 'Unknown server error' }));
                    app.showToast(`Error: ${errorData.error}`, 'error');
                }
            } catch (err) {
                console.error('Save guests error:', err);
                app.showToast(`Error: ${err.message}`, 'error');
            }
        },

        uploadExcel: function (event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    if (jsonData.length === 0) {
                        return app.showToast("Excel sheet is empty", "error");
                    }

                    // Map Excel columns to our student model
                    const students = jsonData.map(row => {
                        // Support multiple column name variations
                        const name = row.Name || row['Student Name'] || row['Full Name'];
                        const id = row['College ID'] || row['ID'] || row['Roll No'];
                        const course = row.Course || row['Department'];
                        const batch = row.Batch || row['Year'];
                        const dobRaw = row['Date of Birth'] || row.DOB || row.Password;

                        // Normalize DOB for password
                        let password = '123'; // fallback
                        if (dobRaw) {
                            if (typeof dobRaw === 'number') {
                                // Handle Excel date serial number
                                const date = XLSX.SSF.parse_date_code(dobRaw);
                                password = `${String(date.d).padStart(2, '0')}${String(date.m).padStart(2, '0')}${date.y}`;
                            } else {
                                // Clean the string (remove / - etc)
                                password = String(dobRaw).replace(/[^0-9]/g, '');
                                // If it's a date string like 12-05-2000, we want 12052000
                            }
                        }

                        return {
                            collegeId: String(id).trim(),
                            name: String(name).trim(),
                            password: password,
                            course: String(course || '').trim(),
                            batch: String(batch || '').trim()
                        };
                    }).filter(s => s.collegeId && s.name);

                    if (students.length === 0) {
                        return app.showToast("No valid student records found", "error");
                    }

                    const confirmed = await app.confirm('Bulk Add Students?', `Found ${students.length} students. Proceed with registration?`, 'info');
                    if (!confirmed) return;

                    app.showToast(`Uploading ${students.length} students...`, 'info');

                    const res = await fetch(`${API_BASE}/admin/students/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ students })
                    });

                    if (res.ok) {
                        app.showToast(`Successfully added ${students.length} students!`, 'success');
                        this.renderList();
                        this.renderStats();
                    } else {
                        let errorMsg = "Bulk upload failed";
                        try {
                            const err = await res.json();
                            errorMsg = err.error || errorMsg;
                        } catch (e) {
                            // If not JSON, try text
                            const text = await res.text().catch(() => "");
                            if (text && text.length < 100) errorMsg = text;
                        }
                        app.showToast(errorMsg, "error");
                    }
                } catch (err) {
                    console.error("Excel analysis error:", err);
                    app.showToast(`Processing Error: ${err.message}`, "error");
                } finally {
                    event.target.value = ''; // Reset file input
                }
            };
            reader.readAsArrayBuffer(file);
        },

        downloadTemplate: function () {
            const data = [
                { "Name": "John Doe", "College ID": "CBS001", "Course": "MCA 1ST YEAR", "Batch": "2026", "Date of Birth": "15-05-2002" },
                { "Name": "Jane Smith", "College ID": "CBS002", "Course": "MBA 2ND YEAR", "Batch": "2027", "Date of Birth": "20-10-2001" }
            ];
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
            XLSX.writeFile(workbook, "student_upload_template.xlsx");
        }
    },

    mess: {
        load: async function () {
            const date = document.getElementById('mess-date').value;
            try {
                const res = await fetch(`${API_BASE}/admin/stats?date=${date}`);
                const stats = await res.json();

                const gBf = stats.guests ? stats.guests.breakfast : 0;
                const gLu = stats.guests ? stats.guests.lunch : 0;

                document.getElementById('mess-bf-count').textContent = stats.breakfast + gBf;
                document.getElementById('mess-lunch-count').textContent = stats.lunch + gLu;

                // Add sub-info if guests exist
                if (gBf > 0 || gLu > 0) {
                    console.log(`Mess: Students ${stats.breakfast}/${stats.lunch}, Guests ${gBf}/${gLu}`);
                }
            } catch (err) {
                console.error('Mess report error:', err);
            }
        }
    },

    updateOnlineStatus: function (isOnline) {
        this.state.isOnline = isOnline;
        const msg = isOnline ? '' : 'You are currently offline. Some features may not work.';
        if (!isOnline) {
            console.log(msg);
        }
    },

    installPWA: async function () {
        if (!deferredPrompt) {
            this.togglePwaGuide(true);
            return;
        }

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`PWA: User response - ${outcome}`);

        deferredPrompt = null;
        document.getElementById('pwa-install-header')?.classList.add('hidden');
        document.getElementById('pwa-install-landing')?.classList.add('hidden');
    },

    togglePwaGuide: function (show) {
        const modal = document.getElementById('pwa-guide-modal');
        if (show) modal.classList.add('active');
        else modal.classList.remove('active');
    },

    updateInstallButtons: function (show = true) {
        const headerBtn = document.getElementById('pwa-install-header');
        const landingBtn = document.getElementById('pwa-install-landing');

        if (show) {
            headerBtn?.classList.remove('hidden');
            landingBtn?.classList.remove('hidden');
        } else {
            headerBtn?.classList.add('hidden');
            landingBtn?.classList.add('hidden');
        }
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
