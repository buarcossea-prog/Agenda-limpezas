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

const FONTES_ICAL = [
  // Website Directo
  { propriedade: 'Cristal Mar', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-7912.ics' },
  { propriedade: 'Tonay Sol', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-6195.ics' },

  // Tonay Sol
  { propriedade: 'Tonay Sol', origem: 'Booking', url: 'https://ical.booking.com/v1/export?t=da5b6e66-1e10-46db-89fa-fa341c354c5d' },
  { propriedade: 'Tonay Sol', origem: 'Airbnb', url: 'https://www.airbnb.com/calendar/ical/913697094754040454.ics?t=4fcdaae84b2740699596375f71e0b5e2&locale=pt-PT' },

  // Cristal Mar
  { propriedade: 'Cristal Mar', origem: 'Booking', url: 'https://ical.booking.com/v1/export?t=8cc3f71c-c7b6-4cb7-b647-abdac1c6d1db' },
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
          const dtendMatch = block.match(/DTEND(?:;VALUE=DATE)?:?([0-9T]+)/);
          const summaryMatch = block.match(/SUMMARY:(.*)/);

          if (dtendMatch && dtendMatch[1]) {
            const rawDate = dtendMatch[1];
            
            let dataFormatted = '';
            if (rawDate.length >= 8) {
              dataFormatted = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
            }

            if (dataFormatted) {
              limpezas.push({
                id: `ical_${fonte.propriedade}_${fonte.origem}_${rawDate}_${i}`,
                propriedade: fonte.propriedade,
                origem: fonte.origem,
                data: dataFormatted,
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
