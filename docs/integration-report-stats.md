# Integration Report Stats API

Документ для интегратора: как получить цифры из Excel-отчета через API.

## Base URL

Production:

```text
https://orzu-medical-orm-21-backend-production.up.railway.app/api
```

Local:

```text
http://localhost:3000/api
```

Swagger:

```text
/api/docs
```

## Авторизация

Все endpoints ниже находятся в integration API и требуют ключ в HTTP header:

```http
x-api-key: YOUR_INTEGRATION_KEY
```

Ключи задаются на backend через переменные окружения:

```bash
INTEGRATION_API_KEYS=key-one,key-two
```

Также поддерживаются старые имена:

```bash
EXTERNAL_API_KEY=key-one
EXTERNAL_API_KEYS=key-one,key-two
```

## Параметры периода

Все report-stats endpoints принимают query параметры:

```text
startDate=2026-06-01
endDate=2026-06-30
branch=Orzu Medical Chilonzor   optional
```

Период считается по `arrivalDate`, так же как в Excel-отчете.

## Формат значения

Metric endpoints возвращают:

```json
{
  "count": 12,
  "ratio": 0.3,
  "percent": 30,
  "base": {
    "key": "correct-total",
    "label": "корректно / Всего",
    "count": 40
  }
}
```

- `count` - число из отчета.
- `ratio` - дробь, которая записывается в Excel percent cell.
- `percent` - тот же процент в человекочитаемом виде.
- `base` - от чего рассчитан процент. Если в отчете у колонки нет процента, `ratio`, `percent`, `base` будут `null`.

## Полный отчетный срез

Получить все цифры отчета за период:

```http
GET /integration/report-stats?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Получить справочник доступных метрик, категорий рейтинга и статусов:

```http
GET /integration/report-stats/catalog
x-api-key: YOUR_INTEGRATION_KEY
```

## Endpoints для dashboard / line chart

Эти endpoints сразу подготовлены для интерфейса: если выбран месяц, в `points` и `series[].points` будут строки по дням.

Качество обслуживания:

```http
GET /integration/dashboard/service-quality?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Качество процедур:

```http
GET /integration/dashboard/procedure-quality?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Конверсия клиентов:

```http
GET /integration/dashboard/client-conversion?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Общий формат для графика:

```json
{
  "chart": {
    "xAxisKey": "date",
    "yAxisKey": "average",
    "valueKey": "value"
  },
  "categories": [],
  "series": [
    {
      "categoryId": "doctors",
      "label": "Врачебная часть",
      "points": [
        {
          "date": "2026-06-01",
          "label": "01.06.2026",
          "value": 4.8,
          "average": 4.8,
          "count": 6
        }
      ]
    }
  ],
  "points": []
}
```

Подробная привязка блоков интерфейса описана в:

```text
docs/dashboard-interface-endpoints.md
```

## Отдельные endpoints по колонкам отчета

Количество переданных номеров:

```http
GET /integration/report-stats/transferred-numbers?startDate=2026-06-01&endDate=2026-06-30
```

Не правильный номер:

```http
GET /integration/report-stats/incorrect/wrong-number?startDate=2026-06-01&endDate=2026-06-30
```

Номер сотрудников:

```http
GET /integration/report-stats/incorrect/employee-number?startDate=2026-06-01&endDate=2026-06-30
```

Нет WhatsApp:

```http
GET /integration/report-stats/incorrect/has-not-whatsapp?startDate=2026-06-01&endDate=2026-06-30
```

Не корректно всего и процент:

```http
GET /integration/report-stats/incorrect/total?startDate=2026-06-01&endDate=2026-06-30
```

Обзвон и процент:

```http
GET /integration/report-stats/correct/called?startDate=2026-06-01&endDate=2026-06-30
```

Дубликаты:

```http
GET /integration/report-stats/correct/duplicates?startDate=2026-06-01&endDate=2026-06-30
```

Не ответили:

```http
GET /integration/report-stats/correct/no-answer?startDate=2026-06-01&endDate=2026-06-30
```

Номер отключен:

```http
GET /integration/report-stats/correct/unreachable?startDate=2026-06-01&endDate=2026-06-30
```

Корректно всего и процент:

```http
GET /integration/report-stats/correct/total?startDate=2026-06-01&endDate=2026-06-30
```

Жалобы и процент:

```http
GET /integration/report-stats/feedback/complaints?startDate=2026-06-01&endDate=2026-06-30
```

Предложения:

```http
GET /integration/report-stats/feedback/suggestions?startDate=2026-06-01&endDate=2026-06-30
```

Жалобы, которые не относятся к клинике:

```http
GET /integration/report-stats/feedback/not-related-complaints?startDate=2026-06-01&endDate=2026-06-30
```

Универсальный endpoint по ключу метрики:

```http
GET /integration/report-stats/metrics/wrong-number?startDate=2026-06-01&endDate=2026-06-30
```

## Рейтинги 5/4/3/2

Категории:

- `doctors`
- `nurses`
- `cleanliness`
- `food`
- `reception`
- `clinic`
- `total`

Получить все оценки по категории МЕДСЕСТРЫ:

```http
GET /integration/report-stats/ratings/nurses?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Получить только 5 баллов по МЕДСЕСТРЫ:

```http
GET /integration/report-stats/ratings/nurses/5?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Ответ по категории содержит `5`, `4`, `3`, `2`:

```json
{
  "category": {
    "id": "nurses",
    "label": "МЕДСЕСТРЫ",
    "scorePrefix": "медсестры"
  },
  "total": {
    "5": { "count": 30, "ratio": 0.75, "percent": 75, "base": {} },
    "4": { "count": 8, "ratio": 0.2, "percent": 20, "base": {} },
    "3": { "count": 2, "ratio": 0.05, "percent": 5, "base": {} },
    "2": { "count": 0, "ratio": 0, "percent": 0, "base": {} }
  },
  "byBranch": []
}
```

Этот же endpoint теперь возвращает поля для line chart:

- `summary.average` / `summary.value` - средняя оценка за период.
- `distribution` - распределение оценок `5/4/3/2`.
- `series[0].points` - точки по дням.
- `points` - те же точки в плоском виде.

## Статусы заявок

Получить количество по конкретному статусу из отчетного периода:

```http
GET /integration/report-stats/status/has_not_whatsapp?startDate=2026-06-01&endDate=2026-06-30
x-api-key: YOUR_INTEGRATION_KEY
```

Статусы:

- `new`
- `contacted`
- `all_ok`
- `no_answer`
- `unreachable`
- `wrong_number`
- `has_not_whatsapp`
- `duplicate`
- `no_phone`
- `other`
- `employee`
- `feedback_pos`
- `feedback_neg`
- `feedback_not_related`

Важно: основной Excel-отчет исключает активные статусы `new` и `contacted`. Поэтому report-stats endpoints считают как отчет: завершенные заявки плюс ошибки импорта.

## Формулы как в отчете

- `кол. переданных номеров` = завершенные заявки за период + ошибки импорта за период.
- `не правильный номер` = статус `wrong_number` + ошибки импорта, кроме `DUPLICATE_FILE`.
- `дубликаты` = ошибки импорта с категорией `DUPLICATE_FILE`.
- `не корректно / всего %` = `не корректно / всего` / `кол. переданных номеров`.
- `корректно / Всего %` = `корректно / Всего` / `кол. переданных номеров`.
- Рейтинги 5/4/3/2 считаются от `корректно / Всего`.
- Процент жалоб считается от `корректно / Всего`.
- Если оценки нет или жалоба не относится к клинике, рейтинг считается как 5.
- `дубликаты`, `не ответили`, `номер отключен` добавляются в рейтинг как 5, как в Excel-отчете.
