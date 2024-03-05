import { CommonInterceptor } from "@app/common"
import { RmqService } from "@app/common/rmq/rmq.service"
import { NestFactory } from "@nestjs/core"
import { RmqOptions } from "@nestjs/microservices"

import { ReservationModule } from "./reservation.module"

async function bootstrap() {
  const app = await NestFactory.create(ReservationModule)
  app.useGlobalInterceptors(new CommonInterceptor())
  const rmqService = app.get<RmqService>(RmqService)
  app.connectMicroservice<RmqOptions>(rmqService.getOptions("RESERVATION", false, 1))
  await app.startAllMicroservices()
  await app.listen(3000)
}
bootstrap()
