// middleware/standardResponse.js
// Middleware لتوحيد صيغة الاستجابة حسب مواصفات جوالي
export default function standardResponse(req, res, next) {
  const oldJson = res.json;
  res.json = function (data) {
    // إذا كانت الاستجابة بالفعل بالصيغ الموحدة، لا تعدلها
    if (
      data &&
      Object.prototype.hasOwnProperty.call(data, 'ResponseCode') &&
      Object.prototype.hasOwnProperty.call(data, 'ResponseMessage') &&
      Object.prototype.hasOwnProperty.call(data, 'body')
    ) {
      return oldJson.call(this, data);
    }
    // تحويل الاستجابات القديمة (success/message/data)
    let ResponseCode = 0;
    let ResponseMessage = 'نجاح';
    let body = null;
    if (data && typeof data === 'object') {
      if (data.success === false) {
        ResponseCode = 9999;
        ResponseMessage = data.message || 'فشل العملية';
        body = null;
      } else if (data.success === true) {
        ResponseCode = 0;
        ResponseMessage = data.message || 'نجاح';
        body = data.data || null;
      } else if (data.error) {
        ResponseCode = 9998;
        ResponseMessage = data.error_description || data.error || 'خطأ';
        body = null;
      } else {
        body = data;
      }
    }
    return oldJson.call(this, { ResponseCode, ResponseMessage, body });
  };
  next();
}
