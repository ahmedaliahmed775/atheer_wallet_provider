// ─────────────────────────────────────────────────────────────
// خدمة إشعارات FCM — Firebase Cloud Messaging Service
// ─────────────────────────────────────────────────────────────
// تُستخدم لإرسال إشعارات الدفع غير المتزامنة للتطبيق
// عند اكتمال عمليات جوالي (نجاح أو فشل)
//
// ملاحظة: في بيئة الإنتاج، يجب تكوين Firebase Admin SDK
// بشهادة خدمة صحيحة. حالياً تعمل في وضع المحاكاة.
// ─────────────────────────────────────────────────────────────

// ─── التحقق من توفر Firebase Admin ──────────────────────────

let firebaseAdmin = null;
let messagingClient = null;
let isFirebaseConfigured = false;

async function initFirebase() {
  if (isFirebaseConfigured) return;

  try {
    // محاولة استيراد firebase-admin (قد لا يكون مثبتاً)
    const admin = await import('firebase-admin');
    firebaseAdmin = admin.default || admin;

    const projectId = process.env.FCM_PROJECT_ID;
    const clientEmail = process.env.FCM_CLIENT_EMAIL;
    const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      if (!firebaseAdmin.apps.length) {
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert({
            projectId,
            clientEmail,
            privateKey
          })
        });
      }
      messagingClient = firebaseAdmin.messaging();
      isFirebaseConfigured = true;
      console.log('✅ Firebase Admin SDK مُهيّأ بنجاح');
    } else {
      console.log('⚠️  Firebase غير مُعدّ — الإشعارات في وضع المحاكاة');
    }
  } catch (err) {
    console.log('⚠️  firebase-admin غير مثبت — الإشعارات في وضع المحاكاة');
  }
}

// تهيئة عند التحميل
initFirebase();

// ─── إرسال إشعار دفع ────────────────────────────────────────

/**
 * إرسال إشعار دفع للمستخدم عبر FCM
 *
 * @param {string} fcmToken - توكن FCM للجهاز
 * @param {object} data - بيانات الإشعار
 * @param {string} data.title - عنوان الإشعار
 * @param {string} data.body - نص الإشعار
 * @param {string} data.type - نوع الإشعار (JAWALI_CASHOUT_SUCCESS, etc.)
 * @param {string} data.transactionRef - مرجع المعاملة
 * @param {string} data.state - حالة المعاملة (SUCCESS, FAILED)
 * @param {number} data.amount - المبلغ
 */
export async function sendPaymentNotification(fcmToken, data) {
  if (!fcmToken) {
    console.log('[FCM] لا يوجد توكن — تخطي الإشعار');
    return { success: false, reason: 'NO_TOKEN' };
  }

  // ── وضع المحاكاة (عندما Firebase غير مُعدّ) ──
  if (!isFirebaseConfigured || !messagingClient) {
    console.log('──────────────────────────────────────────');
    console.log('📱 [FCM-SIMULATION] إشعار دفع:');
    console.log(`   📌 العنوان: ${data.title || 'أثير واليت'}`);
    console.log(`   📝 النص: ${data.body}`);
    console.log(`   🏷️  النوع: ${data.type || 'PAYMENT_STATUS'}`);
    console.log(`   🔗 المرجع: ${data.transactionRef || 'N/A'}`);
    console.log(`   📊 الحالة: ${data.state || 'N/A'}`);
    console.log(`   💰 المبلغ: ${data.amount || 0} ﷼`);
    console.log(`   📲 التوكن: ${fcmToken.substring(0, 20)}...`);
    console.log('──────────────────────────────────────────');

    return {
      success: true,
      simulated: true,
      message: 'إشعار محاكى — Firebase غير مُعدّ'
    };
  }

  // ── إرسال حقيقي عبر Firebase ──
  const message = {
    token: fcmToken,
    notification: {
      title: data.title || 'أثير واليت',
      body: data.body || 'تم تحديث حالة العملية'
    },
    data: {
      type: data.type || 'PAYMENT_STATUS',
      transactionRef: data.transactionRef || '',
      state: data.state || '',
      amount: String(data.amount || 0),
      timestamp: new Date().toISOString()
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'atheer_payment_channel',
        sound: 'default',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      }
    }
  };

  try {
    const response = await messagingClient.send(message);
    console.log(`✅ [FCM] إشعار أُرسل: ${response}`);
    return { success: true, messageId: response };
  } catch (err) {
    console.error(`❌ [FCM] فشل إرسال الإشعار: ${err.message}`);

    // إذا كان التوكن غير صالح، يمكن حذفه من قاعدة البيانات
    if (err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token') {
      console.log('[FCM] التوكن غير صالح — يجب تحديثه من التطبيق');
    }

    return { success: false, error: err.message };
  }
}

// ─── إرسال إشعار لعدة أجهزة ──────────────────────────────

export async function sendMulticastNotification(fcmTokens, data) {
  const results = [];
  for (const token of fcmTokens) {
    const result = await sendPaymentNotification(token, data);
    results.push(result);
  }
  return results;
}
