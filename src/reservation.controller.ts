import { Public, User } from "@app/common/auth/user.decorator"
import { RmqService } from "@app/common/rmq/rmq.service"
import { ReservationCreateType } from "@app/common/schemas/reservation/types"
import { UserType } from "@app/common/schemas/user/types"
import { Controller, Get, NotFoundException, Param, Post } from "@nestjs/common"
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

  @Get(":id")
  async getReservation(@Param("id") id: string, @User() user: UserType) {
    return this.reservationService.getReservation(id, user)
  }

  @Post(":id/confirm")
  async confirmReservation(@Param("id") id: string, @User() user: UserType) {
    return this.reservationService.confirmReservation(id, user.uid)
  }

  @Public()
  @Get("health")
  @HealthCheck()
  check() {
    return this.health.check([])
  }

  // RMQ
  @EventPattern("reservation.create")
  async reservationCreate(
    @Payload()
    { userId, movieId, data }: { data: ReservationCreateType; userId: string; movieId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef()
    const originalMsg = context.getMessage()
    const replyTo = originalMsg.properties.replyTo
    const correlationId = originalMsg.properties.correlationId

    const response = await this.reservationService.makeReservation(movieId, userId, data)
    channel.sendToQueue(replyTo, Buffer.from(JSON.stringify(response)), {
      correlationId,
    })
    this.rmqService.ack(context)
  }

  @EventPattern("reservation.movie.list")
  async reservationByMovieList(
    @Payload() { movieId }: { movieId: string },
    @Ctx() context: RmqContext,
  ) {
    const reservations = await this.reservationService
      .getReservationsByMovie(movieId)
      .catch(() => null)
    this.rmqService.ack(context)

    if (!reservations) throw new NotFoundException("Movie not found")
    return reservations
  }

  @EventPattern("reservation.sceance.list")
  async reservationBySceanceList(
    @Payload() { movieId, sceanceId }: { movieId: string; sceanceId: string },
    @Ctx() context: RmqContext,
  ) {
    const reservations = await this.reservationService
      .getReservationsBySceance(movieId, sceanceId)
      .catch(() => null)
    this.rmqService.ack(context)

    if (!reservations) throw new NotFoundException("Movie not found")
    return reservations
  }
}
