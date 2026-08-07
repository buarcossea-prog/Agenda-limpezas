import fetch from 'node-fetch';
import ical from 'ical';

const FONTES_ICAL = [
  { propriedade: 'Cristal Mar', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-7912.ics' },
  { propriedade: 'Tonay Sol', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-6195.ics' }
];

export default async function handler(req, res) {
  try {
    let limpezas = [];

    for (const fonte of FONTES_ICAL) {
      const response = await fetch(fonte.url);
      const text = await response.text();
      const parsed = ical.parseICS(text);

      for (let k in parsed) {
        const ev = parsed[k];
        if (ev.type === 'VEVENT') {
          const dataCheckout = new Date(ev.end).toISOString().split('T')[0];
          limpezas.push({
            id: `ical_${k}`,
            propriedade: fonte.propriedade,
            origem: fonte.origem,
            data: dataCheckout,
            resumo: ev.summary || 'Reserva'
          });
        }
      }
    }
    res.status(200).json({ success: true, limpezas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
