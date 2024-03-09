import { sleep } from "@app/common"
import { Public } from "@app/common/auth/user.decorator"
import { RmqService } from "@app/common/rmq/rmq.service"
import { Controller, Get } from "@nestjs/common"
import { Ctx, EventPattern, Payload, RmqContext } from "@nestjs/microservices"
import { ApiTags } from "@nestjs/swagger"
import { HealthCheck, HealthCheckService } from "@nestjs/terminus"

import { ReservationService } from "./reservation.service"

@ApiTags("Reservations")
@Controller("reservations")
export class ReservationController {
  constructor(
    private readonly reservationService: ReservationService,
    private readonly rmqService: RmqService,
    private readonly health: HealthCheckService,
  ) {}

  @Public()
  @Get("health")
  @HealthCheck()
  check() {
    return this.health.check([])
  }

  // RMQ
  @EventPattern("reservation.create")
  async reservationCreate(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef()
    const originalMsg = context.getMessage()
    const replyTo = originalMsg.properties.replyTo
    const correlationId = originalMsg.properties.correlationId

    console.log(Date.now(), "Reservation started")
    await sleep(5000)
    console.log(Date.now(), "Reservation created")

    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ reservationUid: "123" })), {
      correlationId,
    })
    this.rmqService.ack(context)
  }
}
