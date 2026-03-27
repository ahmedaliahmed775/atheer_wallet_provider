# دليل هندسي لمبرمجي تطبيق جوالي (Jawali Mobile App)

## 1. بناء Network Interceptor لحقن header تلقائياً

### باستخدام Ktor (Kotlin)
```kotlin
val jawaliHeader = mapOf(
    "messageContext" to "...",
    "messageId" to UUID.randomUUID().toString(),
    "messageTimestamp" to System.currentTimeMillis().toString(),
    "callerId" to "MOBILE_APP"
)

val client = HttpClient {
    install(JsonFeature) { serializer = KotlinxSerializer() }
    install(DefaultRequest) {
        header("Content-Type", "application/json")
    }
    install(HttpSend) {
        intercept { request ->
            val originalBody = request.body as? Map<*, *> ?: emptyMap<String, Any>()
            val newBody = mapOf(
                "header" to jawaliHeader,
                "body" to originalBody["body"]
            )
            request.body = TextContent(Json.encodeToString(newBody), ContentType.Application.Json)
            execute(request)
        }
    }
}
```

### باستخدام Retrofit (Kotlin)

استخدم Interceptor مخصص:
```kotlin
class JawaliHeaderInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val bodyJson = ... // تحويل body الحالي إلى JSON
        val jawaliHeader = JSONObject().apply {
            put("messageContext", "...")
            put("messageId", UUID.randomUUID().toString())
            put("messageTimestamp", System.currentTimeMillis().toString())
            put("callerId", "MOBILE_APP")
        }
        val newBody = JSONObject().apply {
            put("header", jawaliHeader)
            put("body", bodyJson)
        }
        val requestBody = newBody.toString().toRequestBody("application/json".toMediaType())
        val newRequest = original.newBuilder().post(requestBody).build()
        return chain.proceed(newRequest)
    }
}
```

## 2. التوجيهات الأمنية لتخزين كلمة المرور
- استخدم Android Keystore لتخزين كلمة المرور بشكل آمن.
- لا تحفظ كلمة المرور في SharedPreferences أو SQLite بشكل مكشوف.
- عند الحاجة لإرسال كلمة المرور (في عمليات Cashout)، استرجعها من Keystore فقط عند الطلب.

## 3. تدفق المستخدم وتصميم الشاشات

### توليد القسيمة (Voucher)
1. شاشة إدخال المبلغ.
2. عند الضغط على "توليد قسيمة":
   - يرسل التطبيق طلبًا إلى `/api/v1/wallet/generate-voucher` مع header/body.
   - يعرض رمز القسيمة (voucherCode) وتاريخ الانتهاء.

### عملية الدفع للتاجر (Cashout)
1. شاشة إدخال رمز القسيمة من العميل.
2. شاشة إدخال كلمة مرور التاجر (يتم جلبها من Keystore).
3. عند الضغط على "خصم":
   - يرسل التطبيق الطلب إلى `/api/v1/merchant/switch-charge` مع الحقول المطلوبة في body.
   - يعرض نتيجة العملية (نجاح/فشل) مع رسالة واضحة.

---

**ملاحظة:** يجب على كل طلب أن يحتوي على كائن header متكامل كما هو موضح في الأمثلة أعلاه.
