import random

POSITIONS = {
    "GK": "goalkeeper",
    "RB": "defender",
    "RCB": "defender",
    "LCB": "defender",
    "LB": "defender",
    "DMF": "midfielder",
    "CMF": "midfielder",
    "AMF": "midfielder",
    "RWF": "forward",
    "ST": "forward",
    "LWF": "forward",
}

ATTACK_WEIGHTS = {
    "GK": 0.05,
    "RB": 0.5,
    "RCB": 0.25,
    "LCB": 0.25,
    "LB": 0.5,
    "DMF": 0.7,
    "CMF": 1.2,
    "AMF": 2.0,
    "RWF": 2.3,
    "ST": 3.0,
    "LWF": 2.3,
}


def player_weight(player):
    return ATTACK_WEIGHTS.get(player.position, 1.0)


def choose_player(players, weights=None):
    if not players:
        raise ValueError("A team must contain players.")

    return random.choices(
        players,
        weights=weights or [1] * len(players),
        k=1,
    )[0]


def simulate_match(team1, team2):
    """
    Simulate a 90-minute match, with 30 minutes of extra time
    if the score is level after 90 minutes.

    Extra time consists of minutes 91-105 and 106-120.
    A match still level after 120 minutes remains a draw.

    This function performs no database operations. The caller
    is responsible for saving the returned result and statistics.
    """
    if len(team1) != 11 or len(team2) != 11:
        raise ValueError("Both teams must contain exactly 11 players.")

    squads = {
        1: team1,
        2: team2,
    }

    scores = {1: 0, 2: 0}
    player_stats = {}
    team_stats = {}
    events = []

    # More normal/high-tempo matches for more varied scorelines.
    match_tempo = random.choices(
        ["LOW", "NORMAL", "HIGH"],
        weights=[15, 45, 40],
        k=1,
    )[0]

    tempo_settings = {
        "LOW": {
            "incidents": (28, 34),
            "shot_weight": 38,
            "on_target": 0.42,
            "goal_conversion": 0.25,
        },
        "NORMAL": {
            "incidents": (36, 44),
            "shot_weight": 48,
            "on_target": 0.48,
            "goal_conversion": 0.32,
        },
        "HIGH": {
            "incidents": (44, 54),
            "shot_weight": 58,
            "on_target": 0.54,
            "goal_conversion": 0.38,
        },
    }

    settings = tempo_settings[match_tempo]

    # Initialize player and team statistics.
    for team_number, squad in squads.items():
        for player in squad:
            player_stats[(team_number, player.id)] = {
                "player": player,
                "team_number": team_number,
                "rating": 6.0,
                "goals": 0,
                "assists": 0,
                "shots": 0,
                "shots_on_target": 0,
                "saves": 0,
                "tackles": 0,
                "interceptions": 0,
                "yellow_cards": 0,
                "red_cards": 0,
            }

        team_stats[team_number] = {
            "team_number": team_number,
            "possession": 50,
            "shots": 0,
            "shots_on_target": 0,
            "goals": 0,
            "fouls": 0,
            "corners": 0,
            "yellow_cards": 0,
            "red_cards": 0,
        }

    def add_event(
        minute,
        team_number,
        event_type,
        commentary,
        player=None,
        secondary_player=None,
    ):
        events.append({
            "minute": minute,
            "team_number": team_number,
            "event_type": event_type,
            "commentary": commentary[:255],
            "player": player,
            "secondary_player": secondary_player,
        })

    def get_player_stats(team_number, player):
        key = (team_number, player.id)

        if key not in player_stats:
            raise ValueError(
                f"Player {player.id} ({player.name}) is not registered "
                f"in team {team_number}'s match statistics."
            )

        return player_stats[key]

    def simulate_incident(minute, extra_time=False):
        """Generate one match incident and update its statistics."""
        team_number = random.choice([1, 2])
        opponent_number = 2 if team_number == 1 else 1

        squad = squads[team_number]
        opponent = squads[opponent_number]

        stats = team_stats[team_number]
        opponent_stats = team_stats[opponent_number]

        attackers = [
            player
            for player in squad
            if player.position in ("ST", "RWF", "LWF", "AMF", "CMF")
        ] or squad

        defenders = [
            player
            for player in opponent
            if player.position in ("RB", "RCB", "LCB", "LB", "DMF", "CMF")
        ] or opponent

        incident = random.choices(
            [
                "SHOT",
                "TACKLE",
                "INTERCEPTION",
                "FOUL",
                "CORNER",
                "OFFSIDE",
            ],
            weights=[
                settings["shot_weight"],
                18,
                11,
                11,
                12,
                4,
            ],
            k=1,
        )[0]

        if incident == "SHOT":
            shooter = choose_player(
                attackers,
                [player_weight(player) for player in attackers],
            )

            shooter_stats = get_player_stats(team_number, shooter)
            shooter_stats["shots"] += 1
            stats["shots"] += 1

            on_target_probability = settings["on_target"]

            # Extra-time pressure encourages attacking play.
            if extra_time:
                on_target_probability += 0.03

            on_target = random.random() < min(
                on_target_probability,
                0.70,
            )

            if on_target:
                shooter_stats["shots_on_target"] += 1
                stats["shots_on_target"] += 1

            if on_target:
                goal_probability = settings["goal_conversion"]

                # Late goals become more likely as the match progresses.
                if minute >= 75:
                    goal_probability += 0.08

                if minute >= 85:
                    goal_probability += 0.07

                # Teams behind take more risks late in the match.
                if minute >= 75 and scores[team_number] < scores[opponent_number]:
                    goal_probability += 0.07

                if minute >= 85 and scores[team_number] < scores[opponent_number]:
                    goal_probability += 0.08

                # Additional urgency during extra time.
                if extra_time:
                    goal_probability += 0.04

                goal_probability = min(goal_probability, 0.65)

            else:
                goal_probability = 0.0

            if on_target and random.random() < goal_probability:
                scores[team_number] += 1
                stats["goals"] += 1

                shooter_stats["goals"] += 1
                shooter_stats["rating"] += 1.4

                assist = None

                if random.random() < 0.72:
                    possible_assists = [
                        player
                        for player in squad
                        if player.id != shooter.id
                        and player.position != "GK"
                    ]

                    if possible_assists:
                        assist = choose_player(possible_assists)
                        assist_stats = get_player_stats(team_number, assist)
                        assist_stats["assists"] += 1
                        assist_stats["rating"] += 0.5

                normal_phrases = [
                    f"GOAL! {shooter.name} finds the back of the net!",
                    f"What a finish! {shooter.name} scores!",
                    f"Brilliant attacking play ends with {shooter.name} scoring!",
                    f"The crowd erupts as {shooter.name} puts it away!",
                    f"{shooter.name} makes no mistake in front of goal!",
                ]

                golazo_phrases = [
                    f"GOLAZO! {shooter.name} unleashes an absolute rocket!",
                    f"WHAT A GOAL! {shooter.name} scores a stunning long-range strike!",
                    f"An unbelievable finish! {shooter.name} produces a moment of magic!",
                    f"Top corner! {shooter.name} scores a world-class screamer!",
                ]

                if random.random() < 0.10:
                    commentary = random.choice(golazo_phrases)
                else:
                    commentary = random.choice(normal_phrases)

                # Extra excitement for late equalizers and winners.
                if minute >= 85 and scores[team_number] == scores[opponent_number]:
                    commentary = (
                        f"LATE EQUALIZER! {shooter.name} brings the teams level!"
                    )
                elif minute >= 85 and scores[team_number] > scores[opponent_number]:
                    commentary = (
                        f"LATE WINNER! {shooter.name} puts the team in front!"
                    )

                add_event(
                    minute,
                    team_number,
                    "GOAL",
                    commentary,
                    shooter,
                    assist,
                )

            elif on_target:
                goalkeeper = next(
                    (
                        player
                        for player in opponent
                        if player.position == "GK"
                    ),
                    opponent[0],
                )

                goalkeeper_stats = get_player_stats(
                    opponent_number,
                    goalkeeper,
                )
                goalkeeper_stats["saves"] += 1
                goalkeeper_stats["rating"] += 0.25

                add_event(
                    minute,
                    team_number,
                    "SAVE",
                    (
                        f"{shooter.name} tests the goalkeeper, "
                        "who makes an excellent save!"
                    ),
                    shooter,
                    goalkeeper,
                )

            else:
                add_event(
                    minute,
                    team_number,
                    "SHOT",
                    f"{shooter.name} takes aim, but the effort goes wide.",
                    shooter,
                )

        elif incident == "TACKLE":
            tackler = choose_player(defenders)
            tackler_stats = get_player_stats(opponent_number, tackler)

            tackler_stats["tackles"] += 1
            tackler_stats["rating"] += 0.12

            add_event(
                minute,
                opponent_number,
                "TACKLE",
                (
                    f"{tackler.name} times the challenge perfectly "
                    "and wins the ball."
                ),
                tackler,
            )

        elif incident == "INTERCEPTION":
            interceptor = choose_player(defenders)
            interceptor_stats = get_player_stats(
                opponent_number,
                interceptor,
            )

            interceptor_stats["interceptions"] += 1
            interceptor_stats["rating"] += 0.12

            add_event(
                minute,
                opponent_number,
                "INTERCEPTION",
                f"{interceptor.name} reads the pass and intercepts it.",
                interceptor,
            )

        elif incident == "FOUL":
            offender = choose_player(defenders)
            offender_stats = get_player_stats(opponent_number, offender)

            opponent_stats["fouls"] += 1
            offender_stats["rating"] -= 0.12

            if random.random() < 0.18:
                offender_stats["yellow_cards"] += 1
                opponent_stats["yellow_cards"] += 1

                add_event(
                    minute,
                    opponent_number,
                    "YELLOW_CARD",
                    (
                        f"The referee books {offender.name} "
                        "for a late challenge."
                    ),
                    offender,
                )
            else:
                add_event(
                    minute,
                    opponent_number,
                    "FOUL",
                    f"{offender.name} gives away a free kick.",
                    offender,
                )

        elif incident == "CORNER":
            stats["corners"] += 1
            taker = choose_player(attackers)

            add_event(
                minute,
                team_number,
                "CORNER",
                f"{taker.name} prepares to deliver the corner.",
                taker,
            )

        else:
            runner = choose_player(attackers)

            add_event(
                minute,
                team_number,
                "OFFSIDE",
                f"The flag goes up against {runner.name} for offside.",
                runner,
            )

    add_event(
        1,
        0,
        "KICKOFF",
        "The referee blows the whistle. We are underway!",
    )

    # First half and second half: minutes 2-89.
    incident_count = random.randint(*settings["incidents"])
    incident_minutes = sorted(random.sample(range(2, 90), incident_count))

    for minute in incident_minutes:
        simulate_incident(minute)

    add_event(45, 0, "HALFTIME", "The referee signals halftime.")

    # Check the score after 90 minutes.
    extra_time_played = scores[1] == scores[2]

    if extra_time_played:
        add_event(
            90,
            0,
            "EXTRA_TIME_START",
            "The teams are level! Extra time begins.",
        )

        # First extra-time half: minutes 91-105.
        first_extra_count = random.randint(8, 11)
        first_extra_minutes = sorted(
            random.sample(range(91, 106), first_extra_count)
        )

        for minute in first_extra_minutes:
            simulate_incident(minute, extra_time=True)

        add_event(
            105,
            0,
            "EXTRA_TIME_HALFTIME",
            "The first period of extra time ends.",
        )

        # Second extra-time half: minutes 106-120.
        second_extra_count = random.randint(8, 11)
        second_extra_minutes = sorted(
            random.sample(range(106, 121), second_extra_count)
        )

        for minute in second_extra_minutes:
            simulate_incident(minute, extra_time=True)

        add_event(
            120,
            0,
            "FULLTIME",
            "Full-time after extra time! The match is over.",
        )
    else:
        add_event(90, 0, "FULLTIME", "Full-time! The match is over.")

    events.sort(key=lambda event: event["minute"])

    for number, event in enumerate(events, start=1):
        event["event_number"] = number

    # Possession always totals 100%.
    possession1 = random.randint(38, 62)
    team_stats[1]["possession"] = possession1
    team_stats[2]["possession"] = 100 - possession1

    # Calculate final player ratings and Man of the Match.
    motm_key = None
    best_score = float("-inf")

    for key, stats in player_stats.items():
        player = stats["player"]

        stats["rating"] += random.uniform(-0.35, 0.35)

        if player.position == "GK":
            stats["rating"] += 0.15

        if stats["goals"]:
            stats["rating"] += stats["goals"] * 0.4

        if stats["assists"]:
            stats["rating"] += stats["assists"] * 0.3

        if stats["yellow_cards"]:
            stats["rating"] -= stats["yellow_cards"] * 0.4

        stats["rating"] = round(
            max(4.5, min(10.0, stats["rating"])),
            1,
        )

        performance = (
            stats["rating"]
            + stats["goals"] * 1.2
            + stats["assists"] * 0.7
            + stats["saves"] * 0.08
        )

        if performance > best_score:
            best_score = performance
            motm_key = key

    if scores[1] > scores[2]:
        winner_number = 1
    elif scores[2] > scores[1]:
        winner_number = 2
    else:
        winner_number = 0

    return {
        "player1_score": scores[1],
        "player2_score": scores[2],
        "winner_number": winner_number,
        "events": events,
        "team_statistics": list(team_stats.values()),
        "player_ratings": list(player_stats.values()),
        "man_of_the_match": player_stats[motm_key]["player"],
    }