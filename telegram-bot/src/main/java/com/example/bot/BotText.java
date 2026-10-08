package com.example.bot;

import java.util.Locale;

enum BotText {
    WELCOME(
            "🚗 *Welcome to PapeRide, %s!*\n\nI'll help you book a ride in seconds.\n\nTap /request to get started.\nTap /help to see all commands. Use /language to change language.",
            "🚗 *Добро пожаловать в PapeRide, %s!*\n\nЯ помогу вам быстро заказать поездку.\n\nОтправьте /request, чтобы начать.\nОтправьте /help, чтобы увидеть команды. Используйте /language для смены языка.",
            "🚗 *PapeRide'ga xush kelibsiz, %s!*\n\nMen sizga tezda safar buyurtma qilishga yordam beraman.\n\nBoshlash uchun /request yuboring.\nBuyruqlar uchun /help yuboring. Tilni o'zgartirish uchun /language yuboring."),
    HELP(
            "📋 *PapeRide Commands*\n\n/request — Book a new ride\n/rides — Your recent rides and live status\n/cancel — Cancel a request or active ride\n/language — Change language\n/help — Show this help",
            "📋 *Команды PapeRide*\n\n/request — Заказать поездку\n/rides — Последние поездки и их статус\n/cancel — Отменить запрос или активную поездку\n/language — Сменить язык\n/help — Эта справка",
            "📋 *PapeRide buyruqlari*\n\n/request — Yangi safar buyurtma qilish\n/rides — Oxirgi safarlar va ularning holati\n/cancel — So'rov yoki faol safarni bekor qilish\n/language — Tilni o'zgartirish\n/help — Yordam"),
    LANGUAGE_PROMPT(
            "🌐 Choose your language:",
            "🌐 Выберите язык:",
            "🌐 Tilni tanlang:"),
    LANGUAGE_CHANGED(
            "Language set to English.",
            "Язык изменён на русский.",
            "Til o'zbek tiliga o'zgartirildi."),
    PROMPT_PICKUP(
            "📍 *Where should we pick you up?*\n\nShare your current location, or tap 📎 → Location to choose a pin on the map. You can type an address first for a clearer label.",
            "📍 *Где вас забрать?*\n\nОтправьте своё местоположение или нажмите 📎 → Геопозиция, чтобы выбрать точку на карте. Сначала можно ввести адрес для подписи.",
            "📍 *Sizni qayerdan olib ketaylik?*\n\nJoriy joylashuvingizni yuboring yoki 📎 → Joylashuv orqali xaritadan nuqta tanlang. Aniq nom ko‘rinishi uchun avval manzilni yozishingiz mumkin."),
    SHARE_LOCATION(
            "📍 Share my location",
            "📍 Отправить геопозицию",
            "📍 Joylashuvimni yuborish"),
    SHARED_LOCATION(
            "Shared location",
            "Отправленная геопозиция",
            "Yuborilgan joylashuv"),
    PICKUP_NOTED(
            "✍️ Noted: %s\n\nNow share your current location or tap 📎 → Location to pin the pickup point on the map.",
            "✍️ Записано: %s\n\nТеперь отправьте своё местоположение или нажмите 📎 → Геопозиция, чтобы отметить точку посадки на карте.",
            "✍️ Qayd qilindi: %s\n\nEndi joriy joylashuvingizni yuboring yoki 📎 → Joylashuv orqali xaritada olib ketish nuqtasini belgilang."),
    DESTINATION_NOTED(
            "✍️ Noted: %s\n\nNow share your location or tap 📎 → Location to pin the destination on the map.",
            "✍️ Записано: %s\n\nТеперь отправьте геопозицию или нажмите 📎 → Геопозиция, чтобы отметить место назначения на карте.",
            "✍️ Qayd qilindi: %s\n\nEndi joylashuvingizni yuboring yoki 📎 → Joylashuv orqali xaritada manzilni belgilang."),
    PROMPT_DESTINATION(
            "📌 *Where do you want to go?*\n\nShare your location, tap 📎 → Location to choose a map pin, or type the address first for a clearer label.",
            "📌 *Куда вы хотите поехать?*\n\nОтправьте геопозицию, нажмите 📎 → Геопозиция, чтобы выбрать точку на карте, или сначала введите адрес для подписи.",
            "📌 *Qayerga bormoqchisiz?*\n\nJoylashuvni yuboring, xaritadan nuqta tanlash uchun 📎 → Joylashuvni bosing yoki aniq nom uchun avval manzilni yozing."),
    LOCATION_OR_ADDRESS(
            "Please send a location or type an address.",
            "Отправьте геопозицию или введите адрес.",
            "Joylashuvni yuboring yoki manzilni yozing."),
    RIDE_SUMMARY(
            "🚗 Ride Summary\n\n🟢 Pickup: %s\n🔴 Destination: %s\n\nDoes this look right?",
            "🚗 Детали поездки\n\n🟢 Откуда: %s\n🔴 Куда: %s\n\nВсё верно?",
            "🚗 Safar tafsilotlari\n\n🟢 Olib ketish: %s\n🔴 Manzil: %s\n\nHammasi to'g'rimi?"),
    PICKUP("Pickup", "Откуда", "Olib ketish"),
    DESTINATION("Destination", "Куда", "Manzil"),
    CONFIRM("✅ Confirm", "✅ Подтвердить", "✅ Tasdiqlash"),
    CANCEL("❌ Cancel", "❌ Отмена", "❌ Bekor qilish"),
    USE_BUTTONS(
            "👆 Please use the buttons above to *Confirm* or *Cancel* your ride.",
            "👆 Используйте кнопки выше, чтобы *подтвердить* или *отменить* поездку.",
            "👆 Safarni *tasdiqlash* yoki *bekor qilish* uchun yuqoridagi tugmalardan foydalaning."),
    NUDGE(
            "Type /request to book a ride, or /help to see all commands.",
            "Отправьте /request, чтобы заказать поездку, или /help, чтобы увидеть команды.",
            "Safar buyurtma qilish uchun /request, buyruqlarni ko'rish uchun /help yuboring."),
    NO_ACTIVE_REQUEST(
            "⚠️ No active ride request found. Send /request to start a new one.",
            "⚠️ Активный запрос не найден. Отправьте /request, чтобы создать новый.",
            "⚠️ Faol safar so'rovi topilmadi. Yangisini boshlash uchun /request yuboring."),
    NEED_BOTH_LOCATIONS(
            "⚠️ I need both points on the map 📍\n\nSend /request and share your pickup and destination locations.",
            "⚠️ Нужны обе точки на карте 📍\n\nОтправьте /request и поделитесь геопозицией посадки и назначения.",
            "⚠️ Xarita uchun ikkala nuqta ham kerak 📍\n\n/request yuboring va olib ketish hamda manzil joylashuvlarini ulashing."),
    POINTS_MUST_DIFFER(
            "⚠️ Pickup and destination are the same point. Send a different destination pin or address.",
            "⚠️ Точка подачи совпадает с местом назначения. Отправьте другую точку или адрес назначения.",
            "⚠️ Olib ketish va manzil bir xil nuqta. Boshqa manzil nuqtasi yoki manzilni yuboring."),
    PENDING_RIDE_REMINDER(
            "⏳ Your ride is still waiting for a driver. We'll message you as soon as one is assigned.",
            "⏳ Ваша поездка всё ещё ожидает водителя. Мы сообщим, как только он будет назначен.",
            "⏳ Safaringiz hali ham haydovchini kutmoqda. Haydovchi tayinlanganda sizga xabar beramiz."),
    RIDE_CONFLICT(
            "⚠️ You already have a ride in progress. Please wait for it to finish.",
            "⚠️ У вас уже есть активная поездка. Дождитесь её завершения.",
            "⚠️ Sizda allaqachon faol safar bor. U tugashini kuting."),
    BOOK_FAILED(
            "⚠️ Sorry, we couldn't book your ride. Please try again in a moment.",
            "⚠️ Не удалось заказать поездку. Попробуйте ещё раз чуть позже.",
            "⚠️ Safarni buyurtma qilib bo'lmadi. Birozdan so'ng qayta urinib ko'ring."),
    SERVICE_UNAVAILABLE(
            "⚠️ PapeRide is unavailable right now. Please try again in a moment.",
            "⚠️ PapeRide сейчас недоступен. Попробуйте ещё раз чуть позже.",
            "⚠️ PapeRide hozir ishlamayapti. Birozdan so'ng qayta urinib ko'ring."),
    RIDE_CONFIRMED(
            "✅ Ride confirmed! (booking #%s)\n\n🟢 %s: %s\n🔴 %s: %s\n\n🔍 Looking for a driver near you…\nWe'll notify you when a driver accepts your ride!",
            "✅ Поездка подтверждена! (заказ #%s)\n\n🟢 %s: %s\n🔴 %s: %s\n\n🔍 Ищем водителя рядом…\nМы сообщим, когда водитель примет заказ!",
            "✅ Safar tasdiqlandi! (buyurtma #%s)\n\n🟢 %s: %s\n🔴 %s: %s\n\n🔍 Yaqin atrofda haydovchi qidirilmoqda…\nHaydovchi buyurtmani qabul qilganda xabar beramiz!"),
    RIDE_CANCELLED_BUTTON(
            "❌ Ride cancelled.\n\nSend /request whenever you need a ride!",
            "❌ Поездка отменена.\n\nОтправьте /request, когда снова понадобится поездка!",
            "❌ Safar bekor qilindi.\n\nSafar kerak bo'lganda /request yuboring!"),
    CANCELLED_REQUEST(
            "❌ Ride request cancelled.\n\nSend /request whenever you're ready!",
            "❌ Запрос на поездку отменён.\n\nОтправьте /request, когда будете готовы!",
            "❌ Safar so'rovi bekor qilindi.\n\nTayyor bo'lganingizda /request yuboring!"),
    NO_REQUEST(
            "You have no active request.\n\nSend /request to book a ride.",
            "У вас нет активного запроса.\n\nОтправьте /request, чтобы заказать поездку.",
            "Sizda faol so'rov yo'q.\n\nSafar buyurtma qilish uchun /request yuboring."),
    NO_ACTIVE_RIDE(
            "You have no active ride to cancel.\n\nSend /request to book one.",
            "У вас нет активной поездки для отмены.\n\nОтправьте /request, чтобы заказать поездку.",
            "Bekor qilish uchun faol safaringiz yo'q.\n\nSafar buyurtma qilish uchun /request yuboring."),
    CANCELLED_RIDE_ID(
            "❌ Ride #%s has been cancelled.",
            "❌ Поездка #%s отменена.",
            "❌ #%s safar bekor qilindi."),
    CANCEL_FAILED(
            "⚠️ Could not cancel your ride right now. Please try again later.",
            "⚠️ Не удалось отменить поездку. Попробуйте позже.",
            "⚠️ Safarni hozir bekor qilib bo'lmadi. Keyinroq urinib ko'ring."),
    HISTORY_FAILED(
            "⚠️ Could not load your ride history right now. Please try again later.",
            "⚠️ Не удалось загрузить историю поездок. Попробуйте позже.",
            "⚠️ Safarlar tarixini yuklab bo'lmadi. Keyinroq urinib ko'ring."),
    HISTORY_EMPTY(
            "You have no ride requests yet.\n\nTap /request to book your first ride!",
            "У вас пока нет заказов.\n\nОтправьте /request, чтобы заказать первую поездку!",
            "Siz hali safar buyurtma qilmagansiz.\n\nBirinchi safar uchun /request yuboring!"),
    HISTORY_TITLE("🧾 Your recent rides", "🧾 Ваши последние поездки", "🧾 Oxirgi safarlaringiz"),
    BOOKING("booking #%s", "заказ #%s", "buyurtma #%s"),
    RIDE_DRIVER_FOUND("🚕 Driver found!", "🚕 Водитель найден!", "🚕 Haydovchi topildi!"),
    YOUR_DRIVER("Your driver", "Ваш водитель", "Haydovchingiz"),
    DRIVER_ON_WAY("Your driver is on the way!", "Водитель уже едет к вам!", "Haydovchi siz tomonga yo'l oldi!"),
    RIDE_STARTED(
            "🚗 Your ride has started. Sit back and enjoy the trip!",
            "🚗 Поездка началась. Устраивайтесь поудобнее!",
            "🚗 Safaringiz boshlandi. Maroqli yo'l tilaymiz!"),
    RIDE_COMPLETED("✅ Ride completed!", "✅ Поездка завершена!", "✅ Safar yakunlandi!"),
    THANKS_FOR_RIDING("Thanks for riding with PapeRide!", "Спасибо, что выбрали PapeRide!", "PapeRide'ni tanlaganingiz uchun rahmat!"),
    RIDE_CANCELLED_STATUS(
            "❌ Your ride was cancelled.",
            "❌ Ваша поездка отменена.",
            "❌ Safaringiz bekor qilindi."),
    REQUEST_AGAIN("Send /request whenever you need a ride!", "Отправьте /request, когда понадобится поездка!", "Safar kerak bo'lganda /request yuboring!"),
    KM("%s km", "%s км", "%s km");

    private final String english;
    private final String russian;
    private final String uzbek;

    BotText(String english, String russian, String uzbek) {
        this.english = english;
        this.russian = russian;
        this.uzbek = uzbek;
    }

    String format(BotLanguage language, Object... args) {
        String template = switch (language) {
            case RU -> russian;
            case UZ -> uzbek;
            case EN -> english;
        };
        return String.format(Locale.ROOT, template, args);
    }
}
