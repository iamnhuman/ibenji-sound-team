// Build-time PNG decoding only. The website has no dependency on Swift.
import Foundation
import ImageIO
import CoreGraphics

let root=URL(fileURLWithPath:CommandLine.arguments[1])
let target=URL(fileURLWithPath:CommandLine.arguments[2])
let manifest=try Data(contentsOf:root.appendingPathComponent("scripts/original-sources.json"))
let scenes=try JSONSerialization.jsonObject(with:manifest) as! [[String:Any]]
try FileManager.default.createDirectory(at:target,withIntermediateDirectories:true)
for scene in scenes {
  let id=scene["id"] as! String
  let url=root.appendingPathComponent("img/done").appendingPathComponent(scene["source"] as! String)
  guard let source=CGImageSourceCreateWithURL(url as CFURL,nil),
        let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {
    fatalError("Cannot decode \(url.path)")
  }
  let width=image.width,height=image.height
  var pixels=[UInt8](repeating:0,count:width*height*4)
  let context=CGContext(data:&pixels,width:width,height:height,bitsPerComponent:8,bytesPerRow:width*4,
    space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
  context.interpolationQuality = .none
  context.draw(image,in:CGRect(x:0,y:0,width:width,height:height))
  var output=Data()
  for value in [UInt32(width),UInt32(height)] {
    var little=value.littleEndian
    output.append(Data(bytes:&little,count:4))
  }
  output.append(contentsOf:pixels)
  try output.write(to:target.appendingPathComponent(id+".rgba"))
  print("\(id): \(width) × \(height)")
}
