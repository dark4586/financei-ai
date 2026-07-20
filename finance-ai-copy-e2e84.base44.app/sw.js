const CACHE_NAME = 'financeai-v33';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

// Network-first strategy: tenta rede, cai no cache se offline
self.addEventListener('fetch', (event) => {
    // Roda a checagem em segundo plano
    event.waitUntil(performNotificationCheck());

    if (event.request.method !== 'GET') return;
    const isSameOrigin = event.request.url.startsWith(self.location.origin);
    const isMediaDomain = event.request.url.includes('media.base44.com');
    if (!isSameOrigin && !isMediaDomain) return;
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request)
        .then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return response;
        })
        .catch(() => caches.match(event.request))
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    let targetUrl = '/';
    if (event.notification.data && event.notification.data.url) {
        targetUrl = event.notification.data.url;
    } else if (event.notification.tag === 'daily-insight') {
        targetUrl = '/ChatIA?insight=true';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                const clientUrl = new URL(client.url);
                if (clientUrl.origin === self.location.origin && 'focus' in client) {
                    if (targetUrl !== '/' && !client.url.includes(targetUrl)) {
                        return client.navigate(targetUrl).then(c => c.focus());
                    }
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// --- SISTEMA DE VERIFICAÇÃO DE NOTIFICAÇÕES EM SEGUNDO PLANO ---

function getOfflineData() {
    return new Promise((resolve) => {
        const req = indexedDB.open("financeai_offline", 1);
        req.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("state")) {
                db.close();
                resolve(null);
                return;
            }
            try {
                const tx = db.transaction("state", "readonly");
                const store = tx.objectStore("state");
                const getReq = store.get("app_data");
                getReq.onsuccess = () => {
                    db.close();
                    resolve(getReq.result ? getReq.result.value : null);
                };
                getReq.onerror = () => {
                    db.close();
                    resolve(null);
                };
            } catch (err) {
                db.close();
                resolve(null);
            }
        };
        req.onerror = () => resolve(null);
    });
}

function isNotificationShown(id) {
    return new Promise((resolve) => {
        const req = indexedDB.open("financeai_offline", 1);
        req.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("notifications")) {
                db.close();
                resolve(false);
                return;
            }
            try {
                const tx = db.transaction("notifications", "readonly");
                const store = tx.objectStore("notifications");
                const getReq = store.get(id);
                getReq.onsuccess = () => {
                    db.close();
                    resolve(!!getReq.result);
                };
                getReq.onerror = () => {
                    db.close();
                    resolve(false);
                };
            } catch (err) {
                db.close();
                resolve(false);
            }
        };
        req.onerror = () => resolve(false);
    });
}

function markNotificationShown(id) {
    return new Promise((resolve) => {
        const req = indexedDB.open("financeai_offline", 1);
        req.onsuccess = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("notifications")) {
                db.close();
                resolve(false);
                return;
            }
            try {
                const tx = db.transaction("notifications", "readwrite");
                const store = tx.objectStore("notifications");
                store.put({ id, shown_at: Date.now() });
                tx.oncomplete = () => {
                    db.close();
                    resolve(true);
                };
                tx.onerror = () => {
                    db.close();
                    resolve(false);
                };
            } catch (err) {
                db.close();
                resolve(false);
            }
        };
        req.onerror = () => resolve(false);
    });
}

function formatYearMonth(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getDebtInstallmentForMonth(debt, targetMonthStr) {
    if (!debt) return 0;
    if (!debt.mes_referencia) {
        return debt.status === "ativa" ? (debt.valor_parcela || debt.valor_total || 0) : 0;
    }
    const startYear = parseInt(debt.mes_referencia.substring(0, 4));
    const startMonth = parseInt(debt.mes_referencia.substring(5, 7));
    const targetYear = parseInt(targetMonthStr.substring(0, 4));
    const targetMonth = parseInt(targetMonthStr.substring(5, 7));
    if (isNaN(startYear) || isNaN(startMonth) || isNaN(targetYear) || isNaN(targetMonth)) {
        return debt.status === "ativa" ? (debt.valor_parcela || debt.valor_total || 0) : 0;
    }
    const diff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
    const totalInstallments = debt.parcelas_total || 1;
    if (diff >= 0 && diff < totalInstallments) {
        return debt.valor_parcela || debt.valor_total || 0;
    }
    return 0;
}

function Wv(e, t) {
    if (!(e != null && e.valor_parcela)) return 0;
    if (Array.isArray(e.parcelas_datas) && e.parcelas_datas.length > 0) return e.parcelas_datas.reduce((o, s) => s && s.substring(0, 7) === t ? o + e.valor_parcela : o, 0);
    if (!(e != null && e.data_emprestimo)) return 0;
    const n = e.num_parcelas || 1,
        r = new Date(e.data_emprestimo + "T12:00:00"),
        a = e.dia_vencimento || r.getDate();
    let i = 0;
    for (let o = 0; o < n; o++) {
        const s = r.getFullYear(),
            c = r.getMonth() + o,
            d = new Date(s, c + 1, 0).getDate(),
            f = new Date(s, c, Math.min(a, d));
        `${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,"0")}` === t && (i += e.valor_parcela)
    }
    return i
}

async function showSWNotification(id, title, body, url) {
    await self.registration.showNotification(title, {
        body: body,
        icon: "https://media.base44.com/images/public/68f806c8a2f8b052f69dddc2/06ccad4d7_IMG_2980.png",
        badge: "https://media.base44.com/images/public/68f806c8a2f8b052f69dddc2/06ccad4d7_IMG_2980.png",
        data: { url: url },
        vibrate: [200, 100, 200],
        sound: "/assets/notification_sound.wav?v=8"
    });
    await markNotificationShown(id);
}

async function checkAndTriggerNotificationsSW(data) {
    if (!data) return;

    let notificationsShownCount = 0;
    const MAX_NOTIFICATIONS_PER_BATCH = 3;
    const swTriggeredNotificationIds = new Set();

    const isNotificationShownLocal = async (id) => {
        if (swTriggeredNotificationIds.has(id)) return true;
        return await isNotificationShown(id);
    };

    const triggerSWNotification = async (id, title, body, url) => {
        if (notificationsShownCount >= MAX_NOTIFICATIONS_PER_BATCH) return;
        notificationsShownCount++;
        swTriggeredNotificationIds.add(id);
        await showSWNotification(id, title, body, url);
    };

    const { fixedExpenses = [], debts = [], incomes = [], savings = [], goals = [], creditCards = [], loans = [], settings = {} } = data;
    const now = new Date();
    const yearMonth = formatYearMonth(now);
    const todayStr = formatDateStr(now);

    // 1. Rendimento Diario
    let dailyYield = 0;
    savings.forEach(s => {
        const val = parseFloat(s.valor_investido || 0);
        const rate = parseFloat(s.taxa_rendimento || 0);
        if (val > 0 && rate > 0) {
            dailyYield += (val * (rate / 100)) / 365;
        }
    });
    if (dailyYield > 0.01) {
        const id = `daily_yield_${todayStr}`;
        if (!(await isNotificationShownLocal(id))) {
            await triggerSWNotification(id, "📈 Rendimento de CDB", `Seus investimentos renderam aproximadamente R$ ${(dailyYield || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} hoje!`, "/MeusInvestimentos");
        }
    }

    // 2 & 3. Análise de Cartões de Crédito (Notificação Única)
    const cardIssues = [];
    for (const card of creditCards) {
        const disp = parseFloat(card.limite_disponivel || 0);
        const total = parseFloat(card.limite_total || 0);
        if (disp < 0) {
            cardIssues.push(`"${card.nome}" estourado (R$ ${(disp || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
        } else if (total > 0 && (disp / total) <= 0.10) {
            cardIssues.push(`"${card.nome}" com limite crítico (resta R$ ${(disp || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
        }
    }
    if (cardIssues.length > 0) {
        const id = `cards_analysis_${todayStr}`;
        if (!(await isNotificationShownLocal(id))) {
            const title = cardIssues.length === 1 ? "💳 Alerta de Cartão" : "💳 Alerta de Cartões";
            const body = cardIssues.length === 1 
                ? `Atenção: ${cardIssues[0]}.` 
                : `Atenção com seus cartões: ${cardIssues.join("; ")}.`;
            await triggerSWNotification(id, title, body, "/Bancos");
        }
    }

    // 4. Porcentagem de Despesas sobre Receitas (>80%)
    const totalIncome = incomes.filter(inc => {
        var ref;
        return (inc.tipo !== "devedor" || inc.status === "recebido") && (inc.recorrente || inc.tipo === "salario_semanal" || ((ref = inc.mes_referencia) == null ? void 0 : ref.includes(yearMonth)))
    }).reduce((sum, inc) => sum + (inc.tipo === "salario_semanal" ? (inc.valor || 0) * 4.33 : inc.valor || 0), 0);

    const totalExpense = fixedExpenses.filter(e => e.ativa).reduce((sum, e) => sum + (e.valor || 0), 0) +
                         debts.reduce((sum, d) => sum + getDebtInstallmentForMonth(d, yearMonth), 0);

    if (totalIncome > 0 && (totalExpense / totalIncome) >= 0.80) {
        const id = `high_expense_ratio_${yearMonth}`;
        if (!(await isNotificationShownLocal(id))) {
            const pct = (((totalExpense / totalIncome) * 100) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            await triggerSWNotification(id, "🚨 Despesas Altas!", `Suas despesas fixas e dívidas já consomem ${pct}% da sua receita total do mês.`, "/");
        }
    }

    // 5. Meta Quase Atingida (>= 90%)
    for (const goal of goals.filter(g => g.status === "ativo")) {
        const target = parseFloat(goal.valor_alvo || 0);
        const saved = parseFloat(goal.valor_economizado || 0);
        if (target > 0) {
            const pct = (saved / target) * 100;
            if (pct >= 90 && pct < 100) {
                const id = `goal_almost_${goal.id}_${yearMonth}`;
                if (!(await isNotificationShownLocal(id))) {
                    await triggerSWNotification(id, "🎯 Meta Quase Alcançada!", `Falta muito pouco! Você está a ${(pct || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}% de concluir o objetivo "${goal.nome}".`, "/Objetivos");
                }
            }
        }
    }

    // 6. Meta Concluida
    for (const goal of goals.filter(g => g.status === "ativo")) {
        const target = parseFloat(goal.valor_alvo || 0);
        const saved = parseFloat(goal.valor_economizado || 0);
        if (target > 0 && saved >= target) {
            const id = `goal_completed_${goal.id}`;
            if (!(await isNotificationShownLocal(id))) {
                await triggerSWNotification(id, "🏆 Objetivo Concluído!", `Parabéns! Você alcançou sua meta de guardar R$ ${(target || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para "${goal.nome}"!`, "/Objetivos");
            }
        }
    }

    // 7 & 8. Contas Próximas ao Vencimento ou Vencidas
    const currentDay = now.getDate();
    for (const exp of fixedExpenses.filter(e => e.ativa)) {
        if (exp.status === "pendente") {
            const dueDay = parseInt(exp.dia_vencimento || 0);
            if (dueDay > 0) {
                const daysDiff = dueDay - currentDay;
                if (daysDiff >= 0 && daysDiff <= 3) {
                    const id = `exp_due_${exp.id}_${yearMonth}`;
                    if (!(await isNotificationShownLocal(id))) {
                        await triggerSWNotification(id, "📅 Conta Próxima ao Vencimento", `A conta "${exp.nome}" vence em ${daysDiff === 0 ? "hoje!" : `${daysDiff} dia(s)`}. Valor: R$ ${(exp.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "/DespesasFixas");
                    }
                } else if (daysDiff < 0) {
                    const id = `exp_overdue_${exp.id}_${yearMonth}`;
                    if (!(await isNotificationShownLocal(id))) {
                        await triggerSWNotification(id, "🚨 Conta Vencida!", `A conta "${exp.nome}" venceu há ${Math.abs(daysDiff)} dia(s). Evite juros!`, "/DespesasFixas");
                    }
                }
            }
        }
    }

    // 9. Reserva de Emergência Baixa
    const totalSavings = savings.reduce((sum, s) => sum + (s.valor_investido || 0), 0);
    if (totalExpense > 0 && totalSavings < (totalExpense * 3)) {
        const id = `low_emergency_${yearMonth}`;
        if (!(await isNotificationShownLocal(id))) {
            const months = ((totalSavings / totalExpense) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
            await triggerSWNotification(id, "🛡️ Alerta de Reserva", `Seu saldo guardado cobre apenas ${months} meses de despesas. Ideal seria no mínimo 6 meses.`, "/MeusInvestimentos");
        }
    }

    // 10. Saldo Livre Negativo
    if (totalIncome > 0 && totalExpense > totalIncome) {
        const id = `budget_deficit_${yearMonth}`;
        if (!(await isNotificationShownLocal(id))) {
            const diff = totalExpense - totalIncome;
            await triggerSWNotification(id, "💸 Orçamento no Vermelho", `Suas despesas excedem suas receitas em R$ ${(diff || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} este mês.`, "/");
        }
    }

    // 11. Insight da IA
    const idAI = `ai_insight_${todayStr}`;
    if (!(await isNotificationShownLocal(idAI))) {
        await triggerSWNotification(idAI, "🤖 Luna: Novo Insight Financeiro", "Luna analisou seus gastos recentes e tem uma nova sugestão de economia para você. Clique para ver!", "/ChatIA?insight=true");
    }

    // 12. Emissao de Mensagem Motivacional (toda segunda-feira)
    const currentDayOfWeek = now.getDay();
    const idMotiv = `motivacional_${yearMonth}_week_${Math.ceil(currentDay / 7)}`;
    if (currentDayOfWeek === 1 && !(await isNotificationShownLocal(idMotiv))) {
        const quotes = [
            "Economizar hoje é garantir a paz e a tranquilidade de amanhã. Você consegue! 💪",
            "Mantenha o foco nos seus objetivos financeiros. Cada pequeno passo conta! 🎯",
            "Planejar o orçamento não é limitar seus gastos, é direcionar sua liberdade! 🌟",
            "Sua disciplina de hoje constrói a prosperidade de amanhã. Continue assim! 🚀"
        ];
        const quote = quotes[Math.floor(Math.random() * quotes.length)];
        await triggerSWNotification(idMotiv, "✨ Mensagem Motivacional", quote, "/");
    }
}

let lastCheckTime = 0;
async function performNotificationCheck() {
    const now = Date.now();
    // Evita rodar mais do que uma vez a cada 15 minutos
    if (now - lastCheckTime < 900000) return;
    lastCheckTime = now;
    
    try {
        const offlineData = await getOfflineData();
        if (offlineData) {
            await checkAndTriggerNotificationsSW(offlineData);
        }
    } catch (err) {
        console.error("Erro na checagem de notificacoes em background:", err);
    }
}

// Rodar periodicamente a cada 60 segundos
setInterval(() => {
    performNotificationCheck();
}, 60000);