# Dashboard Interface Endpoints

Мини-документ для frontend: какие endpoints нужны для блоков интерфейса со скриншотов.

## Base URL

```text
https://orzu-medical-orm-21-backend-production.up.railway.app/api
```

Локально:

```text
http://localhost:3000/api
```

## Авторизация

Все endpoints ниже находятся в `integration` API и требуют header:

```http
x-api-key: YOUR_INTEGRATION_KEY
```

В Swagger можно заполнить `Authorize` для `x-api-key` или поле `x-api-key` прямо у endpoint. Backend принимает чистый ключ, а также значение вида `x-api-key: KEY` или `Bearer KEY`.

Поддерживаемые env-переменные для ключей:

```text
INTEGRATION_API_KEY
INTEGRATION_API_KEYS
REPORT_STATS_API_KEY
EXTERNAL_API_KEY
EXTERNAL_API_KEYS
API_KEY
API_KEYS
X_API_KEY
X_API_KEYS
```

## Общие query параметры

```text
startDate=2026-06-01
endDate=2026-06-30
branch=Orzu Medical Chilonzor   optional
```

Если выбрать месяц, backend вернет `points` по дням этого месяца.

## Качество обслуживания

Endpoint:

```http
GET /integration/dashboard/service-quality?startDate=2026-06-01&endDate=2026-06-30
```

Что использовать в интерфейсе:

- Заголовок блока: `Качество обслуживания`.
- Список категорий справа: `categories`.
- Активная категория: `categories[0].id` или выбранная пользователем.
- Line chart выбранной категории: найти объект в `series`, где `categoryId === selectedCategoryId`, и взять `points`.
- X-axis: `point.label` или `point.date`.
- Y-axis: `point.value` или `point.average`.
- Оценка справа: `category.value`.
- Количество оценок: `category.count`.
- Звезды: `category.value` из 5.

Категории:

```text
doctors      -> Врачебная часть
nurses       -> Лечебная часть
food         -> Столовая
cleanliness  -> Чистота
```

Мини-форма ответа:

```json
{
  "chart": {
    "xAxisKey": "date",
    "yAxisKey": "average",
    "valueKey": "value",
    "categoryKey": "categoryId"
  },
  "categories": [
    {
      "id": "doctors",
      "label": "Врачебная часть",
      "value": 5,
      "average": 5,
      "count": 30,
      "max": 5
    }
  ],
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
  "points": [
    {
      "date": "2026-06-01",
      "label": "01.06.2026",
      "doctors": 4.8,
      "doctorsCount": 6,
      "nurses": 5,
      "nursesCount": 6
    }
  ]
}
```

Также можно получить одну категорию рейтинга:

```http
GET /integration/report-stats/ratings/doctors?startDate=2026-06-01&endDate=2026-06-30
```

Этот endpoint возвращает счетчики оценок `5/4/3/2`, `summary`, `series` и `points` для line chart.

## Качество процедур

Endpoint:

```http
GET /integration/dashboard/procedure-quality?startDate=2026-06-01&endDate=2026-06-30
```

Что использовать в интерфейсе:

- Заголовок блока: `Качество процедур`.
- Список процедур справа: `categories`.
- Активная процедура: `categories[0].id` или выбранная пользователем.
- Line chart выбранной процедуры: найти объект в `series`, где `categoryId === selectedProcedureId`, и взять `points`.
- X-axis: `point.label` или `point.date`.
- Y-axis: `point.value` или `point.average`.
- Оценка справа: `category.value`.
- Звезды: `category.value` из 5.

Процедуры:

```text
biorhythm        -> БиоРитм
deep-warming     -> Глубокий прогрев
shvz-massage     -> Массаж ШВЗ
electrophoresis  -> Электрофорез
uvch-therapy     -> УВЧ терапия
```

## Конверсия клиентов

Endpoint:

```http
GET /integration/dashboard/client-conversion?startDate=2026-06-01&endDate=2026-06-30
```

Что использовать в интерфейсе:

- Заголовок блока: `Конверсия клиентов`.
- Карточки справа: `cards`.
- Активная метрика для line chart: `cards[0].id` или выбранная пользователем.
- Line chart выбранной метрики: найти объект в `series`, где `metricId === selectedMetricId`, и взять `points`.
- X-axis: `point.label` или `point.date`.
- Y-axis: `point.count`.
- Значение карточки: `card.count`.
- Процент, если нужен: `card.percent`.

Основные карточки:

```text
arrivedClients    -> Пришло клиентов
targetInpatient   -> Целевые (стационар)
successfulDeals   -> Успешные сделки
refusals          -> Отказники
```

Дополнительные метрики для переключателя:

```text
called            -> Поднял трубку
noAnswer          -> Не поднял трубку
unreachable       -> Номер отключен
wrongNumber       -> Неправильный номер
hasNotWhatsapp    -> Нет WhatsApp
employeeNumber    -> Номер сотрудника
```

## Справочник

Endpoint:

```http
GET /integration/report-stats/catalog
```

Использовать для загрузки доступных ключей:

- `metrics` - Excel/report metrics.
- `ratingCategories` - старые категории рейтинга.
- `serviceQualityCategories` - категории блока качества обслуживания.
- `procedureQualityCategories` - процедуры.
- `clientConversionMetrics` - метрики конверсии клиентов.
- `scores` - допустимые оценки.
- `statuses` - статусы заявок.
