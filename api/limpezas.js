import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// Função para enviar notificação instantânea via Telegram
async function notificarTelegram(id, estado) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return;

  // Descobre a propriedade a partir do ID do iCal
  let propriedade = 'Propriedade';
  if (id.includes('Cristal Mar')) {
    propriedade = 'Cristal Mar';
  } else if (id.includes('Tonay Sol')) {
    propriedade = 'Tonay Sol';
  }

  const estadoNorm = (estado || '').toLowerCase();
  let textoMensagem = '';

  if (estadoNorm === 'iniciado' || estadoNorm === 'iniciada' || estadoNorm === 'em_andamento') {
    textoMensagem = `⏳ *Limpeza Iniciada!*\n🏠 Propriedade: *${propriedade}*\nA equipa começou o serviço.`;
  } else if (estadoNorm === 'concluido' || estadoNorm === 'concluida') {
    textoMensagem = `✅ *Limpeza Concluída!*\n🏠 Propriedade: *${propriedade}*\nO apartamento já está pronto!`;
  }

  if (!textoMensagem) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(textoMensagem)}&parse_mode=Markdown`);
  } catch (err) {
    console.error("Erro ao enviar mensagem no Telegram:", err);
  }
}

// Converte string iCal (ex: "20260910" ou "20260910T150000Z") em objeto Date
function parseIcalDate(str) {
  if (!str || str.length < 8) return null;
  const y = parseInt(str.substring(0, 4), 10);
  const m = parseInt(str.substring(4, 6), 10) - 1;
  const d = parseInt(str.substring(6, 8), 10);
  return new Date(Date.UTC(y, m, d));
}

const FONTES_ICAL = [
  // Website Directo
  { propriedade: 'Cristal Mar', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-7912.ics' },
  { propriedade: 'Tonay Sol', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-6195.ics' },

  // Tonay Sol
  { propriedade: 'Tonay Sol', origem: 'Booking', url: 'https://ical.booking.com/v1/export?t=da5b6e66-1e10-46db-89fa-fa341c354c5d' },
  { propriedade: 'Tonay Sol', origem: 'Airbnb', url: 'https://www.airbnb.com/calendar/ical/913697094754040454.ics?t=4fcdaae84b2740699596375f71e0b5e2&locale=pt-PT' },

  // Cristal Mar
  { propriedade: 'Cristal Mar', origem: 'Booking', url: 'https://ical.booking.com/v1/export?t=2e0c6dac-cc34-488b-bb27-889b1bed19b2' },
  { propriedade: 'Cristal Mar', origem: 'Airbnb', url: 'https://www.airbnb.com/calendar/ical/1357310302657236052.ics?t=dee07350f32b440c84ea7a435852ce1a&locale=pt-PT' }
];

export default async function handler(req, res) {
  // Guardar alterações de estado (POST)
  if (req.method === 'POST') {
    try {
      const { id, estado } = req.body;
      if (!id) return res.status(400).json({ error: 'ID em falta' });

      let estados = (await redis.get('estados_limpezas')) || {};
      
      if (estado === 'pendente') {
        delete estados[id];
      } else {
        estados[id] = estado;
      }

      await redis.set('estados_limpezas', estados);

      // Dispara a notificação para o Telegram
      await notificarTelegram(id, estado);

      return res.status(200).json({ success: true, estados });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // Carregar dados e iCals (GET)
  try {
    let limpezas = [];

    for (const fonte of FONTES_ICAL) {
      if (!fonte.url) continue;

      try {
        const response = await fetch(fonte.url);
        const text = await response.text();

        const vevents = text.split('BEGIN:VEVENT');

        for (let i = 1; i < vevents.length; i++) {
          const block = vevents[i].split('END:VEVENT')[0];
          
          const dtstartMatch = block.match(/DTSTART(?:;VALUE=DATE)?:?([0-9T]+)/);
          const dtendMatch = block.match(/DTEND(?:;VALUE=DATE)?:?([0-9T]+)/);
          const summaryMatch = block.match(/SUMMARY:(.*)/);

          if (dtendMatch && dtendMatch[1]) {
            const rawEnd = dtendMatch[1];
            const rawStart = dtstartMatch ? dtstartMatch[1] : null;

            const dateEnd = parseIcalDate(rawEnd);
            const dateStart = parseIcalDate(rawStart);

            // Formata a data de check-out (dia da limpeza)
            const dataFormatted = dateEnd ? dateEnd.toISOString().split('T')[0] : '';
            const checkinFormatted = dateStart ? dateStart.toISOString().split('T')[0] : '';

            // Calcula o número de noites da reserva
            let noites = 0;
            if (dateStart && dateEnd) {
              const diffTime = dateEnd.getTime() - dateStart.getTime();
              noites = Math.round(diffTime / (1000 * 60 * 60 * 24));
            }

            if (dataFormatted) {
              // Gera o link dinâmico com o número de noites/dias
              const link = `https://${req.headers.host || 'buarcossea.pt'}/reserva?propriedade=${encodeURIComponent(fonte.propriedade)}&dias=${noites}&checkin=${checkinFormatted}&checkout=${dataFormatted}`;

              limpezas.push({
                id: `ical_${fonte.propriedade}_${fonte.origem}_${rawEnd}_${i}`,
                propriedade: fonte.propriedade,
                origem: fonte.origem,
                data: dataFormatted,        // Check-out (dia da limpeza)
                checkin: checkinFormatted,  // Check-in
                noites: noites,            // Duração da reserva
                link: link,                // Link gerado com parâmetro de dias
                resumo: summaryMatch ? summaryMatch[1].trim() : 'Reserva'
              });
            }
          }
        }
      } catch (errFonte) {
        console.error(`Erro ao ler iCal de ${fonte.propriedade} (${fonte.origem}):`, errFonte);
      }
    }

    const estados = (await redis.get('estados_limpezas')) || {};

    res.status(200).json({ success: true, limpezas, estados });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
