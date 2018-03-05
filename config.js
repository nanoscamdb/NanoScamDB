module.exports = {
	"port": process.env.PORT || 3000,
	"cache_refreshing_interval": process.env.CACHE_REFRESHING_INTERVAL || 1000 * 60 * 60 * 2,
	"Google_SafeBrowsing_API_Key": process.env.GOOGLE_SAFEBROWSING_API_KEY,
	"base_url": process.env.BASE_URL,
	"Recaptcha_Key": process.env.RECAPTCHA_KEY,
	"Recaptcha_Secret": process.env.RECAPTCHA_SECRET,
	"repository": {
		author: "pocesar",
		name: "NanoScamDB",
		branch: "master"
	}
}