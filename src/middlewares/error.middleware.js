function errorHandler(err, req, res, next) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
    
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Terjadi kesalahan internal pada server. Silakan coba beberapa saat lagi.' 
        : (err.message || 'Internal Server Error');

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
}

module.exports = errorHandler;
