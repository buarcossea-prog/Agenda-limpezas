const FONTES_ICAL = [
  { propriedade: 'Cristal Mar', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-7912.ics' },
  { propriedade: 'Tonay Sol', origem: 'Website Directo', url: 'https://buarcossea.pt/wp-content/uploads/properties-icalendars/icalendar-6195.ics' }
];

export default async function handler(req, res) {
  try {
    let limpezas = [];

    for (const fonte of FONTES_ICAL) {
      if (!fonte.url) continue;

      try {
        const response = await fetch(fonte.url);
        const text = await response.text();

        // Extrai os blocos de eventos do ficheiro iCal
        const vevents = text.split('BEGIN:VEVENT');

        for (let i = 1; i < vevents.length; i++) {
          const block = vevents[i].split('END:VEVENT')[0];
          
          // Procura a data de Checkout (DTEND) e o resumo da reserva
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
                id: `ical_${fonte.propriedade}_${rawDate}_${i}`,
                propriedade: fonte.propriedade,
                origem: fonte.origem,
                data: dataFormatted,
                resumo: summaryMatch ? summaryMatch[1].trim() : 'Reserva'
              });
            }
          }
        }
      } catch (errFonte) {
        console.error(`Erro ao ler iCal de ${fonte.propriedade}:`, errFonte);
      }
    }

    res.status(200).json({ success: true, limpezas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
