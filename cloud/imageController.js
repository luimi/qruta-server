const cloudinary = require("cloudinary");
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
module.exports = {
    upload : (request) =>{
        return new Promise((res, rej) => {
          cloudinary.v2.uploader.upload(
            request.params.image,{},async (error, result) => {
              if(result){
                res({success:true, url: result.url});
              } else {
                res({success:false, message:"Error al intentar guardar la imagen", error:error});
              }
            }
          );
        });
      }
}