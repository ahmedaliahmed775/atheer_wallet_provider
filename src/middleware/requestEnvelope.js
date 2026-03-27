// middleware/requestEnvelope.js
// Middleware عالمي لفرض هيكل الطلبات (header/body) حسب مواصفات جوالي

module.exports = function requestEnvelope(req, res, next) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    // السماح للطلبات التي لا تحمل body
    return next();
  }
  if (!req.is('application/json')) {
    return res.status(400).json({
      ResponseCode: 1001,
      ResponseMessage: 'الطلب يجب أن يكون بصيغة JSON',
      body: null
    });
  }
  const { header, body } = req.body || {};
  if (!header || typeof header !== 'object') {
    return res.status(400).json({
      ResponseCode: 1002,
      ResponseMessage: 'حقل header مفقود أو غير صحيح',
      body: null
    });
  }
  const requiredFields = ['messageContext', 'messageId', 'messageTimestamp', 'callerId'];
  for (const field of requiredFields) {
    if (!header[field]) {
      return res.status(400).json({
        ResponseCode: 1003,
        ResponseMessage: `حقل ${field} مفقود في header`,
        body: null
      });
    }
  }
  req.envelope = { header, body };
  next();
};
